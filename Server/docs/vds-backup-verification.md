# VDS backup verification — 2026-10-07

**Update: external Google Drive backup/restore was accepted at12:46:58UTC on2026-10-07; external timers are enabled and the recovery password is held outside the VDS.** See [external acceptance evidence](vds-external-backup-verification.md). External notifications remain unconfigured. The following records the earlier local-only verification, before Google authorization.

- Signed Ubuntu repositories installed restic package0.16.4-2ubuntu0.24.04.3 and rclone1.60.1+dfsg-3ubuntu0.24.04.6. Binaries report restic0.16.4/go1.22.2 and rclone1.60.1-DEV (distribution build identifier), not a manually downloaded development build.
- Hourly local dump timer active, persistent; monitor every5min active. External upload/check/prune/full-check timers installed but disabled. No OAuth tokens were borrowed from connected Google Drive.
- First real local backup `20261007T093145Z`:69,710bytes,1second, valid pg_restore list/checksums; root-only bundle includes SQL/avatars/config/roles. Production remains empty.
- Local restore into an independent PostgreSQL17 container/volume produced profiles0, content676, links456, migrations3; grants restored and same image verified as restricted runtime role. Synthetic account dump/restore retained authentication, exact profile/balance/inventory/match/cursor. Restart and graceful shutdown tested. Final detailed results in `/root/symbols-runtime-tests.log`; tiny local test is not a full-host RTO guarantee.
- `verify-backup.sh` tested isolated dump failure, upload failure, previous-copy preservation, overlapping-run lock,24-copy local retention, and no-op external freshness. No production outage or real snapshot deletion was used.
- Real **local** restic encrypted snapshot, repository check, retrieval and SHA256 comparison succeeded (68.076KiB). This verifies encryption/restore mechanics, not Google transport or off-host durability. Scratch repositories and test resources removed.
- Shell syntax/systemd verification run. Root-owned fixed command wrappers are not writable by deploy. No unprivileged Docker/sudo grant introduced.

Outstanding: owner-authorized Google OAuth/dedicated location, real external snapshot download+restore, restic password/config recovery copies held by owner outside VDS, external notification channel and external availability observer. Monitor correctly reports missing external backup locally; it is not an active message notification. Target loss window about1hour only after successful hourly external uploads. No WAL/PITR or15-minute recovery claim.

Operational details, schedules, credentials handling, local-only retention limitations, avatar consistency, metadata timing and full-host recovery dependencies: [backup-restore.md](backup-restore.md).
