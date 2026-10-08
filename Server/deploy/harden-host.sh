#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
[[ ${1:-} == --admin-login-verified ]] || { echo 'First verify separate symbols-admin login and sudo'; exit 1; }
cat >/etc/ssh/sshd_config.d/00-symbols.conf <<'EOF'
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication) '
systemctl reload ssh
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose
