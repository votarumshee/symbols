# Google Drive backup acceptance — 2026-10-07

Follow-up: the first scheduled upload succeeded at16:11:29 Moscow (13:11:29UTC), one snapshot in76seconds. The owner subsequently rebooted the VDS; all backup timers persisted, a new local backup and monitoring passed. See [post-reboot acceptance](vds-reboot-verification.md). The remaining text records the initial external acceptance before that reboot.

VDS: `135.106.172.96`, hostname `evs-symbols`. The owner selected Google Drive and completed separate rclone OAuth for `votarumshee@gmail.com`. No token was borrowed from the connected Drive plugin. The remote uses the `drive.file` scope.

## Storage and credentials

- Repository: `rclone:symbols-drive:symbols-production-restic`.
- Dedicated private folder: [symbols-production-restic](https://drive.google.com/drive/folders/1Q7POLQHf2GKa8WgXskJprLHZXlTb_n7B).
- The repository was initialized only after confirming the target was empty. Restic encrypts data before upload.
- `/etc/symbols/rclone.conf`, `/etc/symbols/restic-password`, `/etc/symbols/backup.env`: root:root0600. Private restic cache: `/var/cache/symbols/restic`, root:root0700.
- With explicit owner permission, only the restic password was copied to `Server/private/recovery/restic-password.txt` on the owner's Windows computer. Git exclusion and ACL restricted to owner/SYSTEM were verified. OAuth tokens were not copied. The temporary OAuth service log was removed and the local OAuth SSH tunnel was closed.
- Drive reported 4,705,345,638 bytes free before upload. This is a point-in-time observation, not a reserved capacity guarantee.

## Initial upload

All six existing bundles uploaded successfully. The upload service finished at 12:41:50UTC with result success, six snapshots, elapsed959seconds. Bundles cover 09:31:45,10:00:13,11:00:13,12:00:13,12:08:37 and12:25:50UTC. Snapshot times represent the source dump, not upload completion.

The shared rclone OAuth project temporarily hit Google's per-minute request quota. Retries succeeded. This was an API request limit, not insufficient Drive storage. A dedicated OAuth client may be needed if recurring throttling prevents fresh snapshots; access to this existing repository must be verified when changing OAuth clients under `drive.file`.

## Restore acceptance

**PASS at 12:46:58UTC (15:46:58 Moscow).** `restic check` found no errors across all six snapshots. The following exact snapshot was downloaded from Google Drive, restored with `--verify`, and checked against the bundle's SHA256 manifest:

`28d716ff29fd722224720618a69e721f39f65a0b78a9d6725c1c1038af435e32`

Its source dump time is 12:25:50UTC. Restic restored 11 files/directories (68.076KiB), verifying seven files. The dump was restored into a new PostgreSQL17 container on a private internal Docker network. Initial counts: profiles0, records676, links456, migrations3. The exact application image from snapshot metadata ran with `symbols_app`; schema CREATE was denied and readiness, synthetic registration, bootstrap, trial start and idempotent command replay passed.

Evidence is stored in `/var/lib/symbols/backup-state/external-restore.json` and the `symbols-backup-external-verify.service` journal. The test container, network and temporary restored files were removed; absence was independently checked. Production profiles remain0; application readiness passed and both database/application containers remain healthy. This drill proves recovery of the current small database and bundled files, not a full-host recovery SLA or public WSS functionality.

## Activated schedule

All four external timers were enabled after restore acceptance. The local and monitor timers remain active. The VDS uses UTC; daily times below include Moscow equivalents.

| Operation | Schedule |
|---|---|
| Local dump | Every hour at minute00, up to30s randomized delay |
| Google Drive upload | Every hour at minute10, up to30s randomized delay |
| Repository structure check | Daily04:25UTC /07:25 Moscow |
| Retention/prune | Sunday04:40UTC /07:40 Moscow |
| Full stored-data read/check | First day of month05:20UTC /08:20 Moscow |
| Local health/freshness monitor | Every5minutes, up to30s randomized delay |

Retention:24 hourly,14 daily and4 weekly snapshots; local copies retain the latest24, deleting older ones only when uploaded. A manual no-op upload returned success with zero new snapshots and preserved the source-data freshness timestamp. The monitor subsequently returned success/exit0. Scheduled timer enablement and next executions were checked; the first automatic upload is due at13:10UTC today. No future scheduled execution is claimed as already tested.

External alert delivery remains unconfigured: monitoring currently signals through local service status/journal. No public gameplay opening or OS reboot was performed in this task.

## Code validation

Shell syntax and generated systemd unit validation passed. Local/release/installed SHA256 hashes match for the updated upload and maintenance scripts. The external restore script's local/release hashes also match. The protected cache fixes systemd's lack of HOME/XDG_CACHE_HOME for subsequent runs.

See [backup and recovery runbook](backup-restore.md). External backup acceptance is separate from opening the public API, checking WSS/Android, reboot acceptance, external alerts and CI/CD.
