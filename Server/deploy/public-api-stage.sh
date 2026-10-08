#!/bin/bash
# Dedicated synthetic acceptance environment. No production DB writes.
set -euo pipefail
[[ $EUID == 0 ]]
umask 077
source /etc/symbols/production.env
tester=${1:?Pass the verified public IPv4 address of the reviewer}
[[ $tester =~ ^[0-9.]+$ ]]
work=/var/lib/symbols/public-acceptance-20261007
test ! -e "$work"
mkdir -m700 "$work"
cp /opt/symbols/current/Caddyfile.production "$work/Caddyfile.maintenance"
cat >"$work/maintenance.sh" <<'ROLLBACK'
#!/bin/bash
set -euo pipefail
cat /var/lib/symbols/public-acceptance-20261007/Caddyfile.maintenance >/opt/symbols/current/Caddyfile.production
docker exec symbols-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec symbols-caddy-1 caddy reload --config /etc/caddy/Caddyfile
ROLLBACK
chmod 700 "$work/maintenance.sh"
"$work/maintenance.sh"
suffix=$(openssl rand -hex 6)
db=symbols-public-db-$suffix
app=symbols-public-app-$suffix
net=symbols-public-net-$suffix
printf 'db=%s\napp=%s\nnet=%s\n' "$db" "$app" "$net" >"$work/resources"
password=$(openssl rand -hex 24)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=symbols_public_test\n' "$password" >"$work/db.env"
printf 'DATABASE_URL=postgres://symbols_owner:%s@%s:5432/symbols_public_test\n' "$password" "$db" >"$work/owner.env"
printf 'DATABASE_URL=postgres://symbols_app:%s@%s:5432/symbols_public_test\nTRUST_PROXY=172.30.41.3\nPG_POOL_MAX=5\n' "$password" "$db" >"$work/app.env"
docker network create --internal "$net" >/dev/null
docker run -d --name "$db" --network "$net" --env-file "$work/db.env" --memory 512m --tmpfs /var/lib/postgresql/data:rw,size=256m "$POSTGRES_IMAGE" >/dev/null
for i in {1..60}; do docker exec "$db" pg_isready -h 127.0.0.1 -U postgres -d symbols_public_test >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$db" psql -U postgres -d symbols_public_test -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE ROLE symbols_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
CREATE ROLE symbols_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
ALTER DATABASE symbols_public_test OWNER TO symbols_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO symbols_owner;
GRANT USAGE ON SCHEMA public TO symbols_app;
SQL
docker run --rm --network "$net" --env-file "$work/owner.env" --memory 256m "$SYMBOLS_IMAGE" sh -ec 'node scripts/migrate.mjs && node scripts/seed.mjs && node scripts/grants.mjs' </dev/null
docker create --name "$app" --network "$net" --env-file "$work/app.env" --memory 384m --cpus 0.75 --security-opt no-new-privileges:true "$SYMBOLS_IMAGE" >/dev/null
docker network connect symbols_frontend "$app"
docker start "$app" >/dev/null
for i in {1..30}; do if docker exec "$app" node -e 'fetch("http://127.0.0.1:3000/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then break; fi; sleep 1; done
cat >"$work/Caddyfile.test" <<CADDY
{
 email {\$ACME_EMAIL}
}
{\$DOMAIN} {
 header Strict-Transport-Security "max-age=31536000"
 @private path /metrics /metrics/*
 handle @private {
  respond 404
 }
 @review remote_ip $tester
 handle @review {
  header X-Symbols-Acceptance "$suffix"
  reverse_proxy $app:3000
 }
 handle {
  respond "Service is being prepared" 503
 }
}
CADDY
docker cp "$work/Caddyfile.test" symbols-caddy-1:/tmp/public-test.Caddyfile
docker exec symbols-caddy-1 caddy validate --config /tmp/public-test.Caddyfile --adapter caddyfile
cat "$work/Caddyfile.test" >/opt/symbols/current/Caddyfile.production
docker exec symbols-caddy-1 caddy reload --config /etc/caddy/Caddyfile
printf 'TEST ROUTE ACTIVE reviewer=%s app=%s db=%s network=%s\n' "$tester" "$app" "$db" "$net"
