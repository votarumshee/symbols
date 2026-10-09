#!/bin/bash
set -euo pipefail
exec docker compose --project-name symbols-staging --env-file /etc/symbols-staging/staging.env -f /opt/symbols-staging/current/compose.yaml "$@"
