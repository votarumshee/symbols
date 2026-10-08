#!/bin/bash
# Restore the reviewed routing only; never touch databases or volumes.
set -euo pipefail
[[ $EUID == 0 ]]
test -s /etc/symbols/Caddyfile.maintenance
docker cp /etc/symbols/Caddyfile.maintenance symbols-caddy-1:/tmp/maintenance.Caddyfile
docker exec symbols-caddy-1 caddy validate --config /tmp/maintenance.Caddyfile --adapter caddyfile
# Keep the existing inode of the single-file bind mount.
cat /etc/symbols/Caddyfile.maintenance >/opt/symbols/current/Caddyfile.production
docker exec symbols-caddy-1 caddy reload --config /etc/caddy/Caddyfile
