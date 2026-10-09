#!/bin/bash
set -euo pipefail
umask 077
symbols-staging-backup
dump=/var/backups/symbols-staging/latest/symbols.dump
expected=$(symbols-staging-compose exec -T db psql -U postgres -d symbols -Atc 'SELECT count(*) FROM profiles')
source /etc/symbols-staging/staging.env
name=symbols-staging-restore-$(date +%s)
net=$name-network
cleanup() { docker rm -fv "$name" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
# Disposable internal-only database. Trust applies only to this empty verification container.
docker run -d --name "$name" --network "$net" --memory 256m --cpus 0.5 --pids-limit 128 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=symbols "$POSTGRES_IMAGE" >/dev/null
for n in $(seq 1 60); do docker exec "$name" pg_isready -U postgres -d symbols >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$name" pg_restore -U postgres -d symbols --no-owner --no-acl --exit-on-error <"$dump"
actual=$(docker exec "$name" psql -U postgres -d symbols -Atc 'SELECT count(*) FROM profiles')
[[ $actual = "$expected" ]]
docker exec "$name" psql -U postgres -d symbols -Atc "SELECT json_build_object('profiles',(SELECT count(*) FROM profiles),'migrations',(SELECT count(*) FROM schema_migrations),'contentVersions',(SELECT json_agg(version) FROM content_versions))"
echo 'Staging backup restore PASS'
