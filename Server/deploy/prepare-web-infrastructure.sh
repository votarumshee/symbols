#!/bin/bash
# Prepare hosting without switching the running application/database to an unmerged PR.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo' >&2; exit 1; }
umask 077
asset=${1:?assetVersion required}
incoming=${2:?absolute unpacked web assets directory required}
active_config=${3:?absolute reviewed web Caddyfile required}
[[ $asset =~ ^[a-f0-9]{64}$ && $incoming == /* && $active_config == /* ]]
test -f "$incoming/index.html"; test -f "$incoming/client.js"; test -f "$active_config"
test "$(jq -r .assetVersion "$incoming/build.json")" = "$asset"
test "$(jq -r .nativeApi "$incoming/build.json")" = https://symbols-api.votarumshee.com
test "$(sha256sum "$incoming/client.js" | cut -d' ' -f1)" = "$asset"
install -d -m755 /srv/symbols-web /srv/symbols-web/releases /srv/symbols-web/caddy
install -d -m700 /srv/symbols-web/prepared /var/lib/symbols/web-preparation
destination=/srv/symbols-web/releases/$asset
if [[ -e $destination ]]; then
  diff -qr "$incoming" "$destination" >/dev/null || { echo 'Immutable web release differs' >&2; exit 1; }
else
  mkdir -m755 "$destination"
  cp -a "$incoming/." "$destination/"
  chown -R root:root "$destination"
  find "$destination" -type d -exec chmod 755 {} +
  find "$destination" -type f -exec chmod 644 {} +
fi
install -m600 "$active_config" /srv/symbols-web/prepared/web-active.caddy
# Explicitly do not select current or enable browser API before the application release.
checkpoint=/var/lib/symbols/web-preparation/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m700 "$checkpoint"
old=$(readlink -f /opt/symbols/current)
[[ $old == /opt/symbols/releases/* ]]
printf '%s\n' "$old" >"$checkpoint/previous-runtime"
cp /etc/symbols/production.env "$checkpoint/production.env"
new=/opt/symbols/releases/infra-web-$(date -u +%Y%m%dT%H%M%SZ)
test ! -e "$new"; mkdir -m755 "$new"; cp -a "$old/." "$new/"
switched=false
rollback(){
  cp "$checkpoint/production.env" /etc/symbols/production.env
  if [[ $switched == true ]]; then
    ln -sfn "$old" /opt/symbols/current
    symbols-compose --profile public up -d --no-deps --force-recreate caddy
  fi
}
trap 'rollback' ERR
export NEW_RUNTIME="$new"
python3 <<'PY'
import os,pathlib
p=pathlib.Path(os.environ['NEW_RUNTIME'])/'compose.production.yaml'
s=p.read_text()
mount='      - /srv/symbols-web:/srv/symbols-web:ro\n'
anchor='      - ./Caddyfile.production:/etc/caddy/Caddyfile:ro\n'
if mount not in s:
    assert s.count(anchor)==1
    s=s.replace(anchor,anchor+mount)
if '      WEB_ORIGIN:' not in s:
    anchor='      PG_POOL_MAX: 10\n';assert s.count(anchor)==1
    s=s.replace(anchor,anchor+'      WEB_ORIGIN: ${WEB_ORIGIN:-}\n')
p.write_text(s)
c=p.parent/'Caddyfile.production';s=c.read_text();line='import /srv/symbols-web/caddy/*.caddy'
if line not in s:c.write_text(s.rstrip()+'\n'+line+'\n')
env=pathlib.Path('/etc/symbols/production.env');lines=env.read_text().splitlines()
lines=[x for x in lines if not x.startswith('WEB_ORIGIN=')]
env.write_text('\n'.join(lines)+'\nWEB_ORIGIN=https://symbols.votarumshee.com\n')
PY
chmod 600 /etc/symbols/production.env
source /etc/symbols/production.env
docker compose --project-name symbols --env-file /etc/symbols/production.env -f "$new/compose.production.yaml" config --quiet
docker run --rm --network symbols_frontend -e DOMAIN="$DOMAIN" -e ACME_EMAIL="$ACME_EMAIL" \
  -v "$new/Caddyfile.production:/etc/caddy/Caddyfile:ro" \
  -v /srv/symbols-web:/srv/symbols-web:ro "$CADDY_IMAGE" caddy validate --config /etc/caddy/Caddyfile
switched=true
ln -sfn "$new" /opt/symbols/current
symbols-compose --profile public up -d --no-deps --force-recreate caddy
curl --retry 8 --retry-delay 1 --retry-all-errors -fsS https://symbols-api.votarumshee.com/ready
trap - ERR
jq -n --arg previous "$old" --arg runtime "$new" --arg asset "$asset" --arg checkpoint "$checkpoint" \
 '{previousRuntime:$previous,runtime:$runtime,assetVersion:$asset,rollbackCheckpoint:$checkpoint,applicationSwitched:false,databaseMigrated:false,webPublished:false}' \
 >/var/lib/symbols/web-preparation/prepared.json
cat /var/lib/symbols/web-preparation/prepared.json
