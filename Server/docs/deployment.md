# Deployment, backup and recovery

## First VPS installation

Use a dedicated VPS with Docker Compose and a domain you control. Point its A/AAAA records to the VPS; allow incoming 80/TCP, 443/TCP and optionally 443/UDP, plus administrator SSH. Do not expose 5432 or 3000. Database network is internal; Caddy alone publishes ports. Check that the configured 172.30.41.0/24 subnet does not conflict with an existing network; change the subnet and exact TRUST_PROXY address together if necessary. App reads forwarded IP only from that proxy.

In `Server/.env`, set distinct random URL-safe POSTGRES_PASSWORD, OWNER_PASSWORD and APP_PASSWORD, METRICS_TOKEN, real DOMAIN and ACME_EMAIL. Never commit .env. DATABASE_URL is for local commands; Compose supplies role-specific URLs. Create `private/avatars` before startup. Runtime role is NOSUPERUSER/NOCREATEDB, has DML rights only and read-only content access. The database owner performs migrations separately. Back up .env in the operator's secret manager.

```sh
docker compose up -d db
docker compose run --rm migrate
docker compose up -d server caddy
docker compose ps
```

`migrate` uses profile tools but is explicitly runnable. It executes migrations, seed, then grants. No automatic migration or destructive reset runs with the application. Check HTTPS `/ready`, registration, WSS bootstrap/cursor replay, recovery and a completed synthetic match. Caddy obtains certificates and proxies WS upgrades. Operator must supply the public account-deletion URL in the Play Console and publish the chosen backup retention/privacy policy. Google Play policy reference: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en.

## Monitoring and update

Structured logs contain error codes/request IDs, not request bodies, tokens or recovery codes. `/health` means process alive; `/ready` requires PostgreSQL and matching content. `/metrics` is available with the configured bearer METRICS_TOKEN on the private app interface; Caddy blocks public access. Track requests, errors, cumulative HTTP time/bytes, WS traffic/connections, database pool wait/idle/total, database sizes and event backlog. Alert on error ratio, sustained pool wait, growing due_at delay, backup failure and low disk. Node SIGTERM stops scheduler, closes WS connections and drains the pool.

Before update: verified backup, record current image/commit and contract version, build the new image, run migrations as owner, seed, then `docker compose up -d --no-deps server`. Check readiness and a synthetic match. Do not run `down -v`. Use forward-only migrations; binary rollback is safe only if the old image remains compatible with the current schema/content. Otherwise stop writes and restore/reconcile deliberately. Keep data volume and Caddy volumes through restarts.

## Automatic off-server backups

Install pinned restic on a separate trusted backup host. Configure an encrypted remote RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE using its secret manager, run `restic init` once. Set SYMBOLS_SSH_HOST and administrator-controlled SYMBOLS_REMOTE_DIR in `/etc/symbols-backup.env`; an SSH key must be restricted to the single pg_dump command, not unrestricted Docker control. Copy `deploy/backup.sh` to `/opt/symbols-backup/`, enable the provided systemd service/timer as the backup user. The daily timer invokes a custom-format `pg_dump` through SSH directly into restic. `--stdin-from-command` refuses a failed/truncated dump source; check and retention run only on success. Keep 14 daily and four weekly backups. Monitor service failures externally. The timer and actual remote repository cannot be activated until the owner supplies a backup destination/access.

Back up private avatar files separately to the same encrypted repository and include checksums. Tokens/dumps/private reports never belong in Git, images, PRs or logs. Deletion requests must be tracked across the declared backup retention: restored data cannot silently resurrect deleted accounts. A restored pre-deletion backup must replay the operator's deletion ledger before accepting users.

## Restore drill / incident

Create a separate empty database, never restore over an active production DB. Retrieve a specific backup snapshot with `restic dump SNAPSHOT symbols.dump > private/restore.dump`; check the command exit status. With PostgreSQL 17.11 client run `pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname "$RESTORE_DATABASE_URL" private/restore.dump`. Connection secrets must come from protected environment/.pgpass, not logs. Restore grants for the application role, verify `db:status`, all row counts, total vault balance, open listing escrow and recovery for synthetic accounts. Start the same application image against that DB, complete a game and replay WS events. Restore the matching avatar snapshot. Compare with the backup's reconciliation report before switching traffic.

A local custom-format dump/restore to an empty test database is part of this change's verification. Remote storage, scheduling, DNS, TLS, firewall and actual VPS rollback still require staging verification. Reference: https://restic.readthedocs.io/en/stable/040_backup.html.
