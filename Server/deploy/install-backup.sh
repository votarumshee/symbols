#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
umask 077
dir=$(cd -- "$(dirname -- "$0")" && pwd)
apt-get install -y restic rclone
install -d -m 700 /var/backups/symbols/hourly /var/lib/symbols/backup-state
for script in backup-local backup-upload backup-maintenance monitor; do
  install -o root -g root -m 750 "$dir/$script.sh" "/usr/local/sbin/symbols-$script"
done
if [[ ! -e /etc/symbols/restic-password ]]; then openssl rand -hex 32 >/etc/symbols/restic-password; fi
if [[ ! -e /etc/symbols/backup.env ]]; then
  cat >/etc/symbols/backup.env <<'EOF'
RESTIC_REPOSITORY=rclone:symbols-drive:symbols-production-restic
RESTIC_PASSWORD_FILE=/etc/symbols/restic-password
RCLONE_CONFIG=/etc/symbols/rclone.conf
EOF
fi
chmod 600 /etc/symbols/backup.env /etc/symbols/restic-password
for task in backup-local backup-upload monitor; do
  cat >"/etc/systemd/system/symbols-$task.service" <<EOF
[Unit]
Description=Symbols $task
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/symbols-$task
TimeoutStartSec=45min
UMask=0077
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF
done
for pair in 'backup-local *-*-* *:00:00' 'backup-upload *-*-* *:10:00' 'monitor *-*-* *:0/5:00'; do
  task=${pair%% *}; schedule=${pair#* }
  cat >"/etc/systemd/system/symbols-$task.timer" <<EOF
[Unit]
Description=Symbols scheduled $task
[Timer]
OnCalendar=$schedule
Persistent=true
RandomizedDelaySec=30
[Install]
WantedBy=timers.target
EOF
done
for pair in 'check *-*-* 04:25:00' 'prune Sun *-*-* 04:40:00' 'full-check *-*-01 05:20:00'; do
  task=${pair%% *}; schedule=${pair#* }
  cat >"/etc/systemd/system/symbols-backup-$task.service" <<EOF
[Unit]
Description=Symbols external backup $task
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/symbols-backup-maintenance $task
TimeoutStartSec=2h
UMask=0077
Nice=15
EOF
  cat >"/etc/systemd/system/symbols-backup-$task.timer" <<EOF
[Unit]
Description=Symbols external backup $task schedule
[Timer]
OnCalendar=$schedule
Persistent=true
[Install]
WantedBy=timers.target
EOF
done
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/symbols-*.service /etc/systemd/system/symbols-*.timer
systemctl enable --now symbols-backup-local.timer symbols-monitor.timer
systemctl start symbols-backup-local.service
echo 'External timers remain disabled until authorized OAuth, snapshot and restore acceptance.'
