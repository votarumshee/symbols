#!/bin/bash
set -euo pipefail
umask 077
exec 9>/run/lock/symbols-backup.lock
flock -n 9 || { echo 'Backup already running' >&2; exit 75; }
base=/var/backups/symbols/hourly
state=/var/lib/symbols/backup-state
install -d -m 700 "$base" "$state"
[[ $(df --output=avail -k "$base" | tail -1) -ge 1048576 ]] || { echo 'Less than 1 GiB free for backup' >&2; exit 1; }
started=$(date +%s)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp=$(mktemp -d "$base/.partial.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
symbols-compose exec -T db pg_dump -U postgres -d symbols -Fc >"$tmp/symbols.dump"
symbols-compose exec -T db pg_restore --list <"$tmp/symbols.dump" >/dev/null
# Avatars are file-level copies, not transactionally atomic with SQL. See restore runbook.
tar -C /var/lib/symbols -cf "$tmp/avatars.tar" avatars
config_paths=(etc/symbols/production.env opt/symbols/current/compose.production.yaml opt/symbols/current/init-roles.sh opt/symbols/current/Caddyfile.production)
# Imported web routing is configuration; immutable web assets are rebuilt from release artifacts.
[[ ! -d /srv/symbols-web/caddy ]] || config_paths+=(srv/symbols-web/caddy)
tar -C / -cf "$tmp/configuration.tar" "${config_paths[@]}"
symbols-compose exec -T db pg_dumpall -U postgres --roles-only >"$tmp/roles.sql"
source /etc/symbols/production.env
jq -n --arg time "$stamp" --arg git "$GIT_COMMIT" --arg image "$SYMBOLS_IMAGE" --arg pg "$POSTGRES_IMAGE" '{createdUtc:$time,gitCommit:$git,image:$image,postgres:$pg,avatarsAtomicWithSql:false}' >"$tmp/metadata.json"
symbols-compose exec -T db psql -U postgres -d symbols -Atc "SELECT json_build_object('migrations',(SELECT json_agg(name ORDER BY id) FROM schema_migrations),'content',(SELECT json_agg(version) FROM content_versions),'profiles',(SELECT count(*) FROM profiles),'records',(SELECT count(*) FROM game_content),'links',(SELECT count(*) FROM game_content_links));" >"$tmp/database-metadata.json"
(cd "$tmp" && sha256sum symbols.dump avatars.tar configuration.tar roles.sql >checksums.sha256)
mv "$tmp" "$base/$stamp"
ln -sfn "$base/$stamp" "$base/latest"
date +%s >"$state/local-success"
bytes=$(du -sb "$base/$stamp" | cut -f1)
echo "Local backup success timestamp=$stamp bytes=$bytes seconds=$(($(date +%s)-started))"
# Before external activation local-only retention is explicitly capped at 24.
# After activation, deletion requires an upload marker on each old copy.
mapfile -t dirs < <(find "$base" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | sort -r)
for ((i=24;i<${#dirs[@]};i++)); do
  if [[ ! -e /etc/symbols/external-backup.enabled || -f ${dirs[i]}/uploaded ]]; then
    rm -rf -- "${dirs[i]}"
  fi
done
if [[ ! -e /etc/symbols/external-backup.enabled ]]; then
  echo 'WARNING: external backup is not configured; only latest 24 local copies retained' >&2
fi
