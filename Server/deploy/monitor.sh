#!/bin/bash
set -euo pipefail
umask 077
problem=0
signal() {
  logger -t symbols-monitor -- "$1"
  echo "$1" >&2
  problem=1
  # Owner must install a root-owned executable to deliver selected notifications.
  if [[ -x /etc/symbols/notify ]] && [[ $(stat -c %u /etc/symbols/notify) == 0 ]]; then /etc/symbols/notify "$1" || true; fi
}
curl -fsS --max-time 10 http://127.0.0.1:3000/ready >/dev/null || signal 'Application readiness failed'
[[ $(df --output=pcent / | tail -1 | tr -dc 0-9) -lt 85 ]] || signal 'Disk usage at least 85 percent'
for kind in local external; do
  file=/var/lib/symbols/backup-state/$kind-success
  if [[ ! -f $file ]] || [[ $(($(date +%s)-$(cat "$file"))) -gt 7200 ]]; then signal "$kind backup missing or older than two hours"; fi
done
for name in symbols-db-1 symbols-server-1; do
  status=$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}' "$name")
  [[ $status == 'running healthy 0' ]] || signal "Container $name requires inspection: $status"
done
lag=$(symbols-compose exec -T db psql -U postgres -d symbols -Atc 'SELECT coalesce(max(extract(epoch FROM now()-due_at)),0)::int FROM arenas WHERE due_at<now();')
[[ $lag -lt 30 ]] || signal 'Game scheduler lag exceeds 30 seconds'
exit "$problem"
