#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
umask 077
release=/opt/symbols/releases/c76fcae8e802
if [[ -L /opt/symbols/current && $(readlink -f /opt/symbols/current) != "$release" ]]; then
  echo 'One-release bootstrap refuses to change a different current release' >&2
  exit 1
fi
test -f "$release/compose.production.yaml"
docker load -i /root/symbols-c76fcae8e802.tar
docker pull caddy:2.11.7-alpine
if [[ ! -e /etc/symbols/production.env ]]; then
  for name in POSTGRES_PASSWORD OWNER_PASSWORD APP_PASSWORD METRICS_TOKEN; do
    printf '%s=%s\n' "$name" "$(openssl rand -hex 32)"
  done >/etc/symbols/production.env
  printf 'SYMBOLS_IMAGE=%s\n' "$(docker image inspect symbols-server:c76fcae8e802 --format '{{.Id}}')" >>/etc/symbols/production.env
  printf 'POSTGRES_IMAGE=%s\n' "$(docker image inspect postgres:17.11-bookworm --format '{{index .RepoDigests 0}}')" >>/etc/symbols/production.env
  printf 'CADDY_IMAGE=%s\n' "$(docker image inspect caddy:2.11.7-alpine --format '{{index .RepoDigests 0}}')" >>/etc/symbols/production.env
  printf 'GIT_COMMIT=c76fcae8e802677d3db140c8fea8e29b013eb551\nDOMAIN=\nACME_EMAIL=\n' >>/etc/symbols/production.env
fi
chmod 600 /etc/symbols/production.env
chown -R root:root "$release"
chmod 755 "$release"
ln -sfn "$release" /opt/symbols/current
install -m 755 "$release/symbols-compose" /usr/local/sbin/symbols-compose
install -d -m 750 -o 1000 -g 1000 /var/lib/symbols/avatars
symbols-compose config --quiet
symbols-compose up -d --wait db
symbols-compose run --rm migrate
symbols-compose run --rm migrate
symbols-compose up -d --wait server
curl --fail --silent http://127.0.0.1:3000/health
curl --fail --silent http://127.0.0.1:3000/ready
