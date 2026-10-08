#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
umask 077
image=${1:?candidate image required}
checker=$(cd -- "$(dirname -- "$0")" && pwd)/verify-web-prepared.mjs
test -f "$checker"
source /etc/symbols/production.env
suffix=$(openssl rand -hex 6)
db=symbols-web-restore-$suffix
net=symbols-web-restore-net-$suffix
work=$(mktemp -d /var/lib/symbols/web-restore.XXXXXXXX)
cleanup(){ docker rm -f "$db" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
password=$(openssl rand -hex 32)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=symbols_web_restore\n' "$password" >"$work/db.env"
printf 'DATABASE_URL=postgres://symbols_owner:%s@%s:5432/symbols_web_restore\n' "$password" "$db" >"$work/owner.env"
printf 'DATABASE_URL=postgres://symbols_app:%s@%s:5432/symbols_web_restore\n' "$password" "$db" >"$work/app.env"
docker run -d --name "$db" --network "$net" --env-file "$work/db.env" --memory 512m --tmpfs /var/lib/postgresql/data:rw,size=256m "$POSTGRES_IMAGE" >/dev/null
for i in {1..60}; do docker exec "$db" pg_isready -h127.0.0.1 -U postgres -d symbols_web_restore >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$db" psql -U postgres -d symbols_web_restore -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE ROLE symbols_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
CREATE ROLE symbols_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
ALTER DATABASE symbols_web_restore OWNER TO symbols_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO symbols_owner;
GRANT USAGE ON SCHEMA public TO symbols_app;
SQL
dump=$(readlink -f /var/backups/symbols/hourly/latest)/symbols.dump
docker exec -i "$db" pg_restore -U postgres --role symbols_owner -d symbols_web_restore --no-owner --no-privileges --exit-on-error --single-transaction <"$dump"
before=$(docker exec "$db" psql -U postgres -d symbols_web_restore -Atc 'SELECT count(*) FROM profiles')
docker run --rm --network "$net" --env-file "$work/owner.env" --memory 256m "$image" sh -ec 'node scripts/migrate.mjs && node scripts/seed.mjs && node scripts/grants.mjs'
after=$(docker exec "$db" psql -U postgres -d symbols_web_restore -Atc 'SELECT count(*) FROM profiles')
test "$before" = "$after"
test "$(docker exec "$db" psql -U postgres -d symbols_web_restore -Atc 'SELECT count(*) FROM schema_migrations')" = 4
docker run --rm --network "$net" --env-file "$work/app.env" --memory 256m -v "$checker:/app/deploy/verify-web-prepared.mjs:ro" "$image" node /app/deploy/verify-web-prepared.mjs
printf 'Restored dump SHA256: '; sha256sum "$dump" | cut -d' ' -f1
