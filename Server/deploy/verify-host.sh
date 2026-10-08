#!/bin/bash
set -euo pipefail
sshd -t
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication) '
ufw status verbose
for fw in iptables ip6tables; do "$fw" -S DOCKER-USER; "$fw" -S SYMBOLS-INGRESS; done
systemctl is-enabled docker symbols-docker-firewall symbols-backup-local.timer symbols-monitor.timer
systemctl is-active docker symbols-docker-firewall chrony
systemctl list-timers --all 'symbols-*' --no-pager
ss -lntup
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}'
docker volume ls --format '{{.Name}}'
for file in /opt/symbols/current/*.sh /usr/local/sbin/symbols-*; do bash -n "$file"; done
systemd-analyze verify /etc/systemd/system/symbols-*.service /etc/systemd/system/symbols-*.timer
symbols-compose config --quiet
symbols-compose exec -T db psql -U postgres -d symbols <<'SQL'
SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('symbols_app','symbols_owner');
SELECT (SELECT count(*) FROM profiles) profiles,(SELECT count(*) FROM game_content) records,(SELECT count(*) FROM game_content_links) links,(SELECT count(*) FROM schema_migrations) migrations;
SELECT has_schema_privilege('symbols_app','public','CREATE') app_create,has_table_privilege('symbols_app','profiles','INSERT') app_insert,has_table_privilege('symbols_app','game_content','INSERT') content_insert;
SELECT sequence_schema,sequence_name FROM information_schema.sequences;
SQL
curl --fail --silent http://127.0.0.1:3000/ready
stat -c '%a %U %G %n' /etc/symbols /etc/symbols/production.env /etc/symbols/restic-password /opt/symbols/releases/c76fcae8e802 /var/lib/symbols/avatars
free -m
df -h /
timedatectl status
if [[ -e /var/run/reboot-required ]]; then cat /var/run/reboot-required /var/run/reboot-required.pkgs; fi
