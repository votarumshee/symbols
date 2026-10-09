#!/bin/bash
set -euo pipefail
umask 077
[[ $EUID = 0 ]]
for host in symbols-staging.votarumshee.com symbols-api-staging.votarumshee.com; do
 getent ahostsv4 "$host" | awk '{print $1}' | sort -u | grep -qx 135.106.172.96 || { echo "DNS not ready for $host"; exit 1; }
done
# A shared proxy must never see two Docker aliases named server (production upstream).
docker inspect symbols-staging-api-1 | python3 -c 'import json,sys; n=json.load(sys.stdin)[0]["NetworkSettings"]["Networks"]; assert set(n)=={"symbols_staging_frontend","symbols_staging_database"}; assert "server" not in n["symbols_staging_frontend"]["Aliases"]'
runtime=$(readlink -f /opt/symbols/current)
checkpoint=/var/lib/symbols-staging/checkpoints/$(date -u +%Y%m%dT%H%M%SZ)
mkdir "$checkpoint"
cp "$runtime/compose.production.yaml" "$checkpoint/compose.production.yaml"
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' symbols-server-1 symbols-db-1 >"$checkpoint/production-before.txt"
rollback() {
 cp "$checkpoint/compose.production.yaml" "$runtime/compose.production.yaml"
 rm -f /srv/symbols-web/caddy/staging.caddy
 symbols-compose --profile public up -d --no-deps --force-recreate caddy
}
trap rollback ERR
python3 /opt/symbols-staging/current/patch-ingress.py "$runtime/compose.production.yaml"
cp /opt/symbols-staging/current/hosts.caddy /srv/symbols-web/caddy/staging.caddy
chmod 644 /srv/symbols-web/caddy/staging.caddy
symbols-compose --profile public config --quiet
docker exec symbols-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
symbols-compose --profile public up -d --no-deps --force-recreate caddy
sleep 3
curl --fail --silent https://symbols-api.votarumshee.com/ready >/dev/null
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' symbols-server-1 symbols-db-1 >"$checkpoint/production-after.txt"
cmp "$checkpoint/production-before.txt" "$checkpoint/production-after.txt"
trap - ERR
echo "Staging ingress active; rollback checkpoint $checkpoint"
