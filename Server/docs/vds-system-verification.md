# VDS system verification — 2026-10-07

Target: `evs-symbols`, `135.106.172.96`, Ubuntu 24.04.4 LTS amd64. Source branch `codex/vds-production-setup`; application source commit `c76fcae8e802677d3db140c8fea8e29b013eb551`. Applicable AGENTS.md files were not found. Existing untracked task files preserved.

## Installed and verified

- 2 vCPU, 3915 MiB RAM, ext4 50 GiB; initial disk usage 1.3 GiB. Final approximate usage 5.1 GiB, 43 GiB free, 3305 MiB RAM available; 2 GiB swap, no swap in use.
- Ubuntu signed packages: ca-certificates, curl, gnupg, jq, rsync, sudo, ufw, unattended-upgrades, logrotate. `unattended-upgrade` applied security updates, without distribution upgrade. Non-security/phased updates remain; this is not an assertion that every available Ubuntu package was upgraded.
- Docker official signed stable repository; signing key fingerprint checked against `9DC858229FC7DD38854AE2D88D81803C0EBFCD88`. Docker Engine/CLI **29.8.2**, Compose **5.6.0**. Buildx/containerd packages installed from the same signed source. Docker enabled; `hello-world` ran successfully and its container was removed.
- Preserved working chrony; clock synchronized, timezone UTC. Automatic reboot disabled.
- `symbols-admin` uses the owner's public key and **NOPASSWD sudo ALL**. This is a full administrator, intentionally not a limited deployment account. Separate SSH login and `sudo -n id` succeeded before password login was disabled.
- `symbols-deploy` has a locked password, no authorized deployment key, no Docker group membership and no sudo permission. Future constrained CI delivery is separate work.
- SSH TCP/22 retained, public-key login enabled, password and keyboard-interactive authentication disabled. Root key access retained as recovery path. `sshd -t`, effective drop-ins and Ubuntu socket listening were checked. Existing trusted host key required through `StrictHostKeyChecking=yes` throughout.
- UFW active and enabled for IPv4/IPv6: TCP 22/80/443 and UDP443 allowed, other incoming/routed denied. Real WAN interface is `eth0`; no global IPv6 route/address, only link-local.
- Docker uses iptables-nft with actual DOCKER-USER chains in both families. `symbols-docker-firewall.service` installs an owned ingress chain, limiting new forwarded traffic entering eth0 to original TCP80/443 and UDP443; established traffic allowed. It does not flush other chains. Docker daemon controls its normal network rules.
- journald capped at 256 MiB persistent/64 MiB runtime, 14 days; Docker local logs capped at 3×10 MiB per container.
- Root-owned `/opt/symbols/releases`, `/etc/symbols` 0700, `/var/backups/symbols` 0700, `/var/lib/symbols`; avatar directory is UID/GID1000 mode0750 for the app.

Configuration backups are in root-only `/var/backups/symbols/host-before-setup`; installation logs are `/root/symbols-provision.log`. No private keys or secret values are in Git. Provider-level firewall settings were not available.

## External verification limitation

From the Windows execution environment, SSH returned a real banner. PostgreSQL SSLRequest on 5432, HTTP `/health` on 3000, Docker `/_ping` on 2375 and the 2376 probe did not return application responses. Raw TCP connect reports success even on non-listening ports, consistent with an intermediate proxy, so it does **not** prove end-to-end TCP filtering. On-host listeners, Docker published bindings, UFW and DOCKER-USER were inspected. Database/API/Docker daemon are not publicly bound. A truly independent external network should recheck ports before launch.

## Reapply and reboot

`provision-host.sh` expects `/root/symbols-admin.pub` containing only the authorized public key. It preserves existing credentials/data and merges Docker log configuration; reapplication restarts Docker, so schedule maintenance first. After independently verifying admin login, run `harden-host.sh --admin-login-verified`. Install `docker-firewall.sh` as `/usr/local/sbin/symbols-docker-firewall` and its service into `/etc/systemd/system`, then daemon-reload/enable it. WAN-interface changes require updating the script first.

**Reboot is required** for installed kernel/system security updates (`linux-image-6.8.0-142-generic`, linux-base, libc6). It was deliberately not performed. Running kernel remains 6.8.0-110-generic. At an agreed maintenance time, reboot through the verified administrator; then reconnect:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_vds_symbols" symbols-admin@135.106.172.96
```

Run `sudo bash /opt/symbols/current/verify-host.sh`, inspect kernel/chrony/UFW/Docker firewall, container health, volume names, backup timers and `/ready`. Keep provider console/root-key recovery available until this is accepted. Root-login removal is a separate final hardening decision.

Sources checked: [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/), [Docker packet filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/).
