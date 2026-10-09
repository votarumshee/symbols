#!/bin/bash
set -euo pipefail
umask 077
checkpoint=/var/lib/symbols-staging/checkpoints/persistence-$(date -u +%Y%m%dT%H%M%SZ)
mkdir "$checkpoint"
fingerprint() { symbols-staging-compose exec -T db psql -U postgres -d symbols -Atc 'SELECT id FROM profiles ORDER BY id' | sha256sum; }
fingerprint >"$checkpoint/before.sha256"
[[ $(symbols-staging-compose exec -T db psql -U postgres -d symbols -Atc 'SELECT count(*) FROM profiles') -gt 0 ]]
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' symbols-server-1 symbols-db-1 >"$checkpoint/production-before.txt"
symbols-staging-compose restart db api
symbols-staging-compose up -d --wait db api
fingerprint >"$checkpoint/after-restart.sha256"
cmp "$checkpoint/before.sha256" "$checkpoint/after-restart.sha256"
symbols-staging-compose up -d --wait --force-recreate db api
fingerprint >"$checkpoint/after-recreate.sha256"
cmp "$checkpoint/before.sha256" "$checkpoint/after-recreate.sha256"
docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.Image}}' symbols-server-1 symbols-db-1 >"$checkpoint/production-after.txt"
cmp "$checkpoint/production-before.txt" "$checkpoint/production-after.txt"
curl -fsS https://symbols-api-staging.votarumshee.com/ready
curl -fsS https://symbols-api.votarumshee.com/ready
echo "Staging restart/recreate persistence PASS ($checkpoint)"
