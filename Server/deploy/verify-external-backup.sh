#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
umask 077
source /etc/symbols/backup.env
source /etc/symbols/production.env
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RCLONE_CONFIG
export RESTIC_CACHE_DIR=/var/cache/symbols/restic
install -d -m 700 "$RESTIC_CACHE_DIR"
exec 9>/run/lock/symbols-backup.lock
flock -w 180 9
work=$(mktemp -d /var/backups/symbols/external-review.XXXXXXXX)
suffix=$(openssl rand -hex 6)
container=symbols-external-review-$suffix
network=$container-net
network_created=false
container_created=false
cleanup() {
  if [[ $container_created == true ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  if [[ $network_created == true ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
restic check </dev/null
snapshot=$(restic snapshots --json --tag symbols-hourly </dev/null | jq -er 'sort_by(.time) | last.id')
[[ $snapshot =~ ^[0-9a-f]{64}$ ]]
restic restore "$snapshot" --target "$work/restored" --verify </dev/null
bundle=$work/restored/var/backups/symbols/upload-current
test -s "$bundle/symbols.dump"
(cd "$bundle" && sha256sum --status -c checksums.sha256)
restore_image=$(jq -er .image "$bundle/metadata.json")
[[ $restore_image =~ ^sha256:[0-9a-f]{64}$ ]]
docker image inspect "$restore_image" >/dev/null
password=$(openssl rand -hex 24)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=symbols_external_test\n' "$password" >"$work/postgres.env"
printf 'DATABASE_URL=postgres://symbols_owner:%s@%s:5432/symbols_external_test\n' "$password" "$container" >"$work/owner.env"
printf 'DATABASE_URL=postgres://symbols_app:%s@%s:5432/symbols_external_test\n' "$password" "$container" >"$work/app.env"
docker network create --internal "$network" >/dev/null
network_created=true
container_created=true
docker run -d --name "$container" --network "$network" --env-file "$work/postgres.env" --memory 512m --tmpfs /var/lib/postgresql/data:rw,size=256m "$POSTGRES_IMAGE" >/dev/null
ready=false
for i in {1..30}; do
  if docker exec "$container" pg_isready -U postgres -d symbols_external_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]]
docker exec -i "$container" psql -U postgres -d symbols_external_test -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE ROLE symbols_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
CREATE ROLE symbols_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
ALTER DATABASE symbols_external_test OWNER TO symbols_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO symbols_owner;
GRANT USAGE ON SCHEMA public TO symbols_app;
SQL
docker exec -i "$container" pg_restore -U postgres --role symbols_owner -d symbols_external_test --no-owner --no-privileges --exit-on-error --single-transaction <"$bundle/symbols.dump"
docker exec "$container" psql -U postgres -d symbols_external_test -Atc "SELECT json_build_object('profiles',(SELECT count(*) FROM profiles),'records',(SELECT count(*) FROM game_content),'links',(SELECT count(*) FROM game_content_links),'migrations',(SELECT count(*) FROM schema_migrations));" >"$work/counts.json"
docker run --rm --network "$network" --env-file "$work/owner.env" --memory 256m "$restore_image" node scripts/grants.mjs </dev/null
docker run --rm -i --network "$network" --env-file "$work/app.env" --memory 256m "$restore_image" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildApp} from './src/app.mjs';
const app=await buildApp({databaseUrl:process.env.DATABASE_URL,log:false,scheduler:false});
try {
 const role=(await app.pool.query("SELECT current_user,has_schema_privilege(current_user,'public','CREATE') AS ddl")).rows[0];
 assert.equal(role.current_user,'symbols_app'); assert.equal(role.ddl,false);
 assert.equal((await app.inject({url:'/ready'})).statusCode,200);
 const registered=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'CloudRestore'}});
 assert.equal(registered.statusCode,201);
 const headers={authorization:'Bearer '+registered.json().token,'idempotency-key':randomUUID()};
 assert.equal((await app.inject({url:'/api/v3/bootstrap',headers})).statusCode,200);
 const req={method:'POST',url:'/api/v3/commands/start',headers,payload:{mode:'trial',small:true}};
 const first=await app.inject(req); assert.equal(first.statusCode,200);
 const second=await app.inject(req); assert.equal(second.statusCode,200); assert.deepEqual(second.json(),first.json());
 assert.ok((await app.inject({url:'/api/v3/bootstrap',headers})).json().match);
 console.log('EXTERNAL RESTORE PASS: limited role, readiness, registration, bootstrap, trial and idempotency');
} finally {await app.close();}
NODE
jq -n --arg snapshot "$snapshot" --arg verified "$(date -u +%FT%TZ)" --slurpfile counts "$work/counts.json" '{snapshot:$snapshot,verifiedUtc:$verified,counts:$counts[0],source:"Google Drive restic",result:"PASS"}' >"$work/result.json"
install -m 600 "$work/result.json" /var/lib/symbols/backup-state/external-restore.json
cat "$work/result.json"
