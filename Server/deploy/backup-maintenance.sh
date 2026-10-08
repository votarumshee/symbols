#!/bin/bash
set -euo pipefail
umask 077
export RESTIC_CACHE_DIR=/var/cache/symbols/restic
install -d -m 700 "$RESTIC_CACHE_DIR"
exec 9>/run/lock/symbols-backup.lock
flock -n 9 || exit 75
[[ -f /etc/symbols/external-backup.enabled ]]
source /etc/symbols/backup.env
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RCLONE_CONFIG
case ${1:-} in
  check) restic check ;;
  full-check) restic check --read-data ;;
  prune)
    [[ -f /var/lib/symbols/backup-state/external-success ]]
    [[ $(($(date +%s)-$(cat /var/lib/symbols/backup-state/external-success))) -lt 7200 ]]
    restic forget --host evs-symbols --tag symbols-hourly --group-by host,tags --keep-hourly 24 --keep-daily 14 --keep-weekly 4
    restic prune --max-unused 10% --max-repack-size 1G ;;
  *) exit 2 ;;
esac
