#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]]
[[ $(. /etc/os-release; echo "$VERSION_ID") == 24.04 ]]
umask 077
install -d -m 700 /var/backups/symbols /etc/symbols
backup=/var/backups/symbols/host-before-setup
if [[ ! -e $backup ]]; then
  mkdir -m 700 "$backup"
  cp -a /etc/ssh /etc/fstab /etc/apt "$backup/"
  [[ ! -d /etc/docker ]] || cp -a /etc/docker "$backup/"
  command -v iptables-save >/dev/null && iptables-save >"$backup/iptables" || true
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg jq rsync sudo ufw unattended-upgrades logrotate
cat >/etc/apt/apt.conf.d/52symbols-security <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
unattended-upgrade
id symbols-admin >/dev/null 2>&1 || useradd --create-home --shell /bin/bash symbols-admin
install -d -m 700 -o symbols-admin -g symbols-admin /home/symbols-admin/.ssh
# The public key is supplied separately, never infer a private credential.
test -s /root/symbols-admin.pub
touch /home/symbols-admin/.ssh/authorized_keys
key=$(cat /root/symbols-admin.pub)
grep -qxF "$key" /home/symbols-admin/.ssh/authorized_keys || printf '%s\n' "$key" >>/home/symbols-admin/.ssh/authorized_keys
chown symbols-admin:symbols-admin /home/symbols-admin/.ssh/authorized_keys
chmod 600 /home/symbols-admin/.ssh/authorized_keys
printf 'symbols-admin ALL=(ALL:ALL) NOPASSWD: ALL\n' >/etc/sudoers.d/symbols-admin
chmod 440 /etc/sudoers.d/symbols-admin
visudo -cf /etc/sudoers.d/symbols-admin
id symbols-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash symbols-deploy
usermod -L symbols-deploy
install -d -m 755 /opt/symbols/releases /var/lib/symbols /var/lib/symbols/avatars
install -d -m 755 /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/symbols.conf <<'EOF'
[Journal]
SystemMaxUse=256M
RuntimeMaxUse=64M
MaxRetentionSec=14day
EOF
systemctl restart systemd-journald
if [[ ! -e /swapfile ]] && [[ $(swapon --noheadings | wc -l) == 0 ]]; then
  [[ $(df --output=avail -k / | tail -1) -gt 4194304 ]]
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
fingerprint=$(gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc | awk -F: '$1=="fpr" {print $10;exit}')
[[ $fingerprint == 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ]]
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
install -d -m 755 /etc/docker
[[ -f /etc/docker/daemon.json ]] || echo '{}' >/etc/docker/daemon.json
jq '. + {"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' /etc/docker/daemon.json >/etc/docker/daemon.json.tmp
mv /etc/docker/daemon.json.tmp /etc/docker/daemon.json
dockerd --validate --config-file=/etc/docker/daemon.json
systemctl enable --now docker
systemctl restart docker
docker run --rm --name symbols-provision-hello hello-world
echo 'BASE_SETUP_DONE: verify separate symbols-admin SSH/sudo before harden-host.sh'
