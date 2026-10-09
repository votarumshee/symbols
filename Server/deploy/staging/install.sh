#!/bin/bash
set -euo pipefail
umask 077
[[ $EUID = 0 ]]
src=$(cd "$(dirname "$0")" && pwd)
sha=39e3241175e6ce9f23cd783bed0c16782440ec6a
image=sha256:3d7b1ae39ad546dde77483fe28bc1d7aa25a8a368f05137d743c37000c684e1a
docker image inspect "$image" >/dev/null
release=/opt/symbols-staging/releases/$sha
install -d -m 700 /etc/symbols-staging /var/lib/symbols-staging/checkpoints
install -d -m 755 "$release" /srv/symbols-web/staging/releases
install -d -o 1000 -g 1000 -m 750 /var/lib/symbols-staging/avatars
cp "$src"/{compose.yaml,init-roles.sh,hosts.caddy,patch-ingress.py,activate-ingress.sh,verify-isolation.sh,verify-restore.sh} "$release/"
chmod 755 "$release/init-roles.sh"
if [[ ! -f /etc/symbols-staging/staging.env ]]; then
 pg=$(docker inspect symbols-db-1 --format '{{.Image}}')
 {
  printf 'GIT_COMMIT=%s\nSYMBOLS_IMAGE=%s\nPOSTGRES_IMAGE=%s\n' "$sha" "$image" "$pg"
  for key in POSTGRES_PASSWORD OWNER_PASSWORD APP_PASSWORD METRICS_TOKEN; do printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"; done
 } >/etc/symbols-staging/staging.env
fi
chmod 600 /etc/symbols-staging/staging.env
ln -sfn "$release" /opt/symbols-staging/current
install -m 755 "$src/compose-wrapper.sh" /usr/local/sbin/symbols-staging-compose
install -m 755 "$src/backup.sh" /usr/local/sbin/symbols-staging-backup
install -m 644 "$src"/symbols-staging-backup.{service,timer} /etc/systemd/system/
symbols-staging-compose config --quiet
symbols-staging-compose up -d --wait db
symbols-staging-compose run --rm migrate
symbols-staging-compose up -d --wait api
asset=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["assetVersion"])' "$src/www/build.json")
web=/srv/symbols-web/staging/releases/$asset
if [[ ! -d $web ]]; then mkdir "$web"; cp -a "$src/www/." "$web/"; fi
chmod -R a+rX /srv/symbols-web/staging
ln -sfn "$web" /srv/symbols-web/staging/current
systemctl daemon-reload
systemctl enable --now symbols-staging-backup.timer
echo 'Staging application installed; ingress activation is a separate step.'
