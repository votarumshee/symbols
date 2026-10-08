#!/bin/bash
set -euo pipefail
umask 077
source /etc/symbols/production.env
dir=/opt/symbols/current
# Refuse all collisions BEFORE installing cleanup; these fixed names are reserved
# only for this explicit verification command, never for deployment.
for name in symbols-test-runner symbols-test-db symbols-test-app; do
  if docker container inspect "$name" >/dev/null 2>&1; then echo "Test container already exists: $name" >&2; exit 1; fi
done
if docker network inspect symbols_test_network >/dev/null 2>&1 || docker volume inspect symbols_test_pgdata >/dev/null 2>&1; then
  echo 'Reserved test network/volume already exists; refusing cleanup or reuse' >&2; exit 1
fi
state=$(mktemp -d /var/backups/symbols/verify-test.XXXXXXXX)
started=$(date +%s)
cleanup() {
  docker rm -f symbols-test-runner symbols-test-db symbols-test-app 2>/dev/null || true
  docker network rm symbols_test_network 2>/dev/null || true
  docker volume rm symbols_test_pgdata 2>/dev/null || true
  # Exact directory created by this invocation only.
  rm -rf -- "$state"
}
trap cleanup EXIT
! docker container inspect symbols-test-db >/dev/null 2>&1
! docker volume inspect symbols_test_pgdata >/dev/null 2>&1
docker network create --internal symbols_test_network
docker volume create symbols_test_pgdata
pass=$(openssl rand -hex 32)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=symbols_test_runtime\n' "$pass" >"$state/db.env"
printf 'TEST_DATABASE_URL=postgres://postgres:%s@symbols-test-db/symbols_test_runtime\nDATABASE_URL=postgres://postgres:%s@symbols-test-db/symbols_test_runtime\n' "$pass" "$pass" >"$state/app.env"
chmod 700 "$state"
docker run -d --name symbols-test-db --network symbols_test_network --env-file "$state/db.env" --mount source=symbols_test_pgdata,target=/var/lib/postgresql/data "$POSTGRES_IMAGE"
for i in {1..30}; do docker exec symbols-test-db pg_isready -U postgres -d symbols_test_runtime && break; sleep 1; done
docker run --rm --name symbols-test-runner --network symbols_test_network --env-file "$state/app.env" --tmpfs /app/public/avatars:rw,uid=1000,gid=1000,mode=750 -v "$dir/verification-tests:/app/test:ro" "$SYMBOLS_IMAGE" node --test '--test-skip-pattern=private SQLite' test/integration.test.mjs test/domain.test.mjs
echo 'LOCAL PRODUCTION DUMP RESTORE'
docker exec -i symbols-test-db psql -U postgres -d symbols_test_runtime -v password="$pass" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE symbols_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'password';
CREATE ROLE symbols_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'password';
SQL
docker exec symbols-test-db createdb -U postgres -O symbols_owner symbols_test_restored
docker exec -i symbols-test-db pg_restore -U postgres --role symbols_owner -d symbols_test_restored --no-owner --no-privileges --exit-on-error --single-transaction < /var/backups/symbols/hourly/latest/symbols.dump
docker exec symbols-test-db psql -U postgres -d symbols_test_restored -Atc "SELECT (SELECT count(*) FROM profiles),(SELECT count(*) FROM game_content),(SELECT count(*) FROM game_content_links),(SELECT count(*) FROM schema_migrations);"
# Verification files may contain test credentials; only root in test container accesses them.
docker run --rm --name symbols-test-runner --user 0 --network symbols_test_network --env-file "$state/app.env" -e MODE=seed -v "$dir/verify-isolated.mjs:/app/verify.mjs:ro" -v "$state:/verify-state" "$SYMBOLS_IMAGE" node /app/verify.mjs
docker exec symbols-test-db pg_dump -U postgres -d symbols_test_runtime -Fc >"$state/synthetic.dump"
docker exec symbols-test-db createdb -U postgres symbols_test_synthetic_restored
docker exec -i symbols-test-db pg_restore -U postgres -d symbols_test_synthetic_restored --no-owner --no-privileges --exit-on-error --single-transaction <"$state/synthetic.dump"
printf 'DATABASE_URL=postgres://postgres:%s@symbols-test-db/symbols_test_synthetic_restored\n' "$pass" >"$state/restored.env"
docker run --rm --name symbols-test-runner --user 0 --network symbols_test_network --env-file "$state/restored.env" -v "$dir/verify-isolated.mjs:/app/verify.mjs:ro" -v "$state:/verify-state" "$SYMBOLS_IMAGE" node /app/verify.mjs
# The production restore is independent of the original DB container.
printf 'DATABASE_URL=postgres://symbols_owner:%s@symbols-test-db/symbols_test_restored\n' "$pass" >"$state/owner.env"
docker run --rm --network symbols_test_network --env-file "$state/owner.env" "$SYMBOLS_IMAGE" node scripts/grants.mjs
printf 'DATABASE_URL=postgres://symbols_app:%s@symbols-test-db/symbols_test_restored\nSCHEDULER=false\n' "$pass" >"$state/restored-app.env"
docker run -d --name symbols-test-app --network symbols_test_network --env-file "$state/restored-app.env" "$SYMBOLS_IMAGE"
for i in {1..30}; do docker exec symbols-test-app node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && break; sleep 1; done
docker restart symbols-test-db
recovered=false
for i in {1..30}; do
  if docker exec symbols-test-app node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then recovered=true; break; fi
  sleep 1
done
[[ $recovered == true ]]
echo 'Runtime-role readiness recovered after test database restart'
docker exec -i symbols-test-app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const request=async(path,options={})=>{const r=await fetch('http://127.0.0.1:3000'+path,options);assert.ok(r.ok,path+' status '+r.status);return r.json();};
const account=await request('/api/v3/account/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nick:'Restore test'})});
const headers={authorization:'Bearer '+account.token,'content-type':'application/json','idempotency-key':randomUUID()};
const before=await request('/api/v3/bootstrap',{headers});assert.equal(before.profile.balanceCents,'100');
const options={method:'POST',headers,body:JSON.stringify({mode:'trial',small:true})};
const first=await request('/api/v3/commands/start',options);
assert.deepEqual(await request('/api/v3/commands/start',options),first);
const after=await request('/api/v3/bootstrap',{headers});assert.ok(after.match);
console.log('Restored restricted runtime role: registration/bootstrap/trial/idempotency passed');
JS
docker stop -t 30 symbols-test-app
test "$(docker inspect --format '{{.State.ExitCode}}' symbols-test-app)" = 0
echo "RESTORE_DRILL_AND_RUNTIME_TEST_SECONDS=$(($(date +%s)-started))"
