#!/bin/bash
set -euo pipefail
umask 077
exec 9>/run/lock/symbols-staging-backup.lock
flock -n 9 || exit 75
base=/var/backups/symbols-staging
install -d -m 700 "$base"
[[ $(df --output=avail -k "$base" | tail -1) -ge 1048576 ]]
tmp=$(mktemp -d "$base/.partial.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
symbols-staging-compose exec -T db pg_dump -U postgres -d symbols -Fc >"$tmp/symbols.dump"
symbols-staging-compose exec -T db pg_restore --list <"$tmp/symbols.dump" >/dev/null
tar -C /var/lib/symbols-staging -cf "$tmp/avatars.tar" avatars
tar -C / -cf "$tmp/configuration.tar" etc/symbols-staging/staging.env opt/symbols-staging/current/compose.yaml opt/symbols-staging/current/init-roles.sh opt/symbols-staging/current/hosts.caddy
(cd "$tmp" && sha256sum symbols.dump avatars.tar configuration.tar >checksums.sha256)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mv "$tmp" "$base/$stamp"
ln -sfn "$base/$stamp" "$base/latest"
mapfile -t dirs < <(find "$base" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | sort -r)
for ((i=7;i<${#dirs[@]};i++)); do rm -rf -- "${dirs[i]}"; done
echo "Staging local backup success $stamp"
