#!/bin/bash
set -euo pipefail
umask 077
export RESTIC_CACHE_DIR=/var/cache/symbols/restic
install -d -m 700 "$RESTIC_CACHE_DIR"
exec 9>/run/lock/symbols-backup.lock
flock -n 9 || exit 75
[[ -f /etc/symbols/external-backup.enabled ]] || { echo 'External backup not authorized/configured' >&2; exit 1; }
source /etc/symbols/backup.env
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RCLONE_CONFIG
[[ $RESTIC_REPOSITORY == rclone:symbols-drive:* ]] || exit 1
started=$(date +%s)
uploaded=0
base=/var/backups/symbols/hourly
for source in "$base"/20*T*Z; do
  [[ -d $source && ! -f $source/uploaded ]] || continue
  # Fixed source path ensures retention groups are stable across timestamped copies.
  work=/var/backups/symbols/upload-current
  install -d -m 700 "$work"
  rsync -a --delete --exclude uploaded "$source/" "$work/"
  stamp=$(jq -r .createdUtc "$work/metadata.json")
  backup_time="${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}"
  TZ=UTC restic backup --quiet --time "$backup_time" --host evs-symbols --tag symbols-hourly "$work"
  date -u +%FT%TZ >"$source/uploaded"
  date -u -d "$backup_time UTC" +%s >/var/lib/symbols/backup-state/external-success
  uploaded=$((uploaded+1))
done
date +%s >/var/lib/symbols/backup-state/external-operation
echo "External backup operation snapshots=$uploaded seconds=$(($(date +%s)-started))"
