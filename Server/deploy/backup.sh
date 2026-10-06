#!/usr/bin/env bash
# Run on a DIFFERENT backup host. SSH key restricted to the dump command below.
set -euo pipefail
: "${SYMBOLS_SSH_HOST:?}" "${SYMBOLS_REMOTE_DIR:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
# Remote path must be an administrator-controlled absolute path without shell metacharacters.
[[ "$SYMBOLS_REMOTE_DIR" =~ ^/[a-zA-Z0-9_/-]+$ ]] || exit 2
restic backup --stdin-from-command --stdin-filename symbols.dump --tag symbols -- \
 ssh -o BatchMode=yes "$SYMBOLS_SSH_HOST" "cd $SYMBOLS_REMOTE_DIR && docker compose exec -T db pg_dump -U postgres -d symbols -Fc"
restic check
restic forget --tag symbols --keep-daily 14 --keep-weekly 4 --prune
