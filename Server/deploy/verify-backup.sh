#!/bin/bash
set -euo pipefail
umask 077
work=$(mktemp -d /var/backups/symbols/backup-test.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
export WORK="$work"
python3 <<'PY'
import os,pathlib
w=pathlib.Path(os.environ['WORK'])
for d in ['bin','copies/hourly','state/backup-state','config','run','files/avatars']:(w/d).mkdir(parents=True,exist_ok=True)
for name in ['backup-local','backup-upload']:
 s=pathlib.Path('/opt/symbols/current/'+name+'.sh').read_text()
 for a,b in [('/var/backups/symbols',str(w/'copies')),('/var/lib/symbols',str(w/'state')),('/etc/symbols',str(w/'config')),('/run/lock/symbols-backup.lock',str(w/'run/backup.lock'))]:s=s.replace(a,b)
 (w/(name+'.sh')).write_text(s)
(w/'config/production.env').write_text('GIT_COMMIT=test\nSYMBOLS_IMAGE=test\nPOSTGRES_IMAGE=test\n')
(w/'config/backup.env').write_text('RESTIC_REPOSITORY=rclone:symbols-drive:test\nRESTIC_PASSWORD_FILE=/unused\nRCLONE_CONFIG=/unused\n')
PY
cat >"$work/bin/symbols-compose" <<'EOF'
#!/bin/bash
case "$*" in
 *'pg_dump -U'*) [[ ${FAIL_DUMP:-0} == 0 ]] || exit 37; cat /var/backups/symbols/hourly/latest/symbols.dump ;;
 *'pg_restore --list'*) cat >/dev/null ;;
 *'pg_dumpall'*) echo '-- test roles only' ;;
 *'psql'*) echo '{}' ;;
 *) exit 2 ;;
esac
EOF
cat >"$work/bin/tar" <<'EOF'
#!/bin/bash
while [[ $# -gt 0 ]]; do if [[ $1 == -cf ]]; then shift; exec /usr/bin/tar -cf "$1" --files-from /dev/null; fi; shift; done
exit 2
EOF
cat >"$work/bin/restic" <<'EOF'
#!/bin/bash
[[ ${FAIL_UPLOAD:-0} == 0 ]] || exit 38
exit 0
EOF
chmod 700 "$work/bin/"*
export PATH="$work/bin:$PATH"
# A failed dump must never replace the last successful copy or create a receipt.
mkdir "$work/copies/hourly/20260101T000000Z"
echo sentinel >"$work/copies/hourly/20260101T000000Z/sentinel"
if FAIL_DUMP=1 bash "$work/backup-local.sh"; then echo 'Fault incorrectly accepted'; exit 1; fi
test -f "$work/copies/hourly/20260101T000000Z/sentinel"
test ! -e "$work/state/backup-state/local-success"
# Lock path is isolated from production.
(flock 9; if bash "$work/backup-local.sh"; then exit 1; else test $? = 75; fi) 9>"$work/run/backup.lock"
for day in $(seq -w 2 27); do mkdir "$work/copies/hourly/202601${day}T000000Z"; done
bash "$work/backup-local.sh"
test "$(find "$work/copies/hourly" -maxdepth 1 -type d -name '20*T*Z' | wc -l)" = 24
# Restrict upload fixture to the most recent complete copy.
find "$work/copies/hourly" -maxdepth 1 -type d -name '202601*T*Z' -exec rm -rf -- {} +
touch "$work/config/external-backup.enabled"
if FAIL_UPLOAD=1 bash "$work/backup-upload.sh"; then echo 'Upload fault incorrectly accepted'; exit 1; fi
test ! -e "$work/state/backup-state/external-success"
test ! -e "$work/copies/hourly/latest/uploaded"
bash "$work/backup-upload.sh"
before=$(cat "$work/state/backup-state/external-success")
bash "$work/backup-upload.sh"
test "$(cat "$work/state/backup-state/external-success")" = "$before"
echo 'Isolated dump/upload failure, last-copy preservation, flock, 24-copy retention and no-op freshness checks passed'
# Real encrypted local restic snapshot and retrieval; this is NOT an external backup.
export RESTIC_REPOSITORY="$work/restic-repository"
export RESTIC_PASSWORD_FILE=/etc/symbols/restic-password
/usr/bin/restic init --quiet
/usr/bin/restic backup --quiet --tag local-verification "$(readlink -f /var/backups/symbols/hourly/latest)"
/usr/bin/restic check --quiet
/usr/bin/restic restore latest --target "$work/restored" --quiet
original=$(sha256sum /var/backups/symbols/hourly/latest/symbols.dump | cut -d' ' -f1)
restored=$(find "$work/restored" -name symbols.dump -type f -exec sha256sum {} \; | cut -d' ' -f1)
test "$original" = "$restored"
echo 'Real local encrypted restic snapshot/check/retrieve passed; no Google Drive access tested'
