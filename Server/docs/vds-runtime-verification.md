# VDS runtime verification — 2026-10-07

Subsequent update: `symbols-api.votarumshee.com` now has verified public HTTPS through Caddy with a maintenance response. See [TLS verification](vds-tls-verification.md). The initial installation snapshot below predates that change; external backup and public gameplay remain pending.

## State

**Private runtime is operational; public launch is pending.** Docker Compose project `symbols`, stable volumes `symbols_pgdata`, `symbols_caddydata`, `symbols_caddyconfig`. Database and server are healthy. Only server loopback `127.0.0.1:3000` is published; PostgreSQL has no host port. Caddy public profile is stopped, its configuration returns maintenance rather than forwarding game requests.

Production contains **0 profiles, 676 content records, 456 relations, 3 migrations** (`0001_init`, `0002_avatar_deletions`, `0003_wallet_shape`). Repeating migrate/seed applied no migrations and kept profiles empty. Content version `6ce99aba116be01d15816dccb4f85613ba314a8fb8c78ae1da70cb33d79f7c56`. No legacy data was imported into production.

## Artifact provenance

Source commit `c76fcae8e802677d3db140c8fea8e29b013eb551`. Application built with local Windows Docker Desktop Linux engine, never built on the VDS; copied using `docker save` + SSH and loaded on VDS. Both migrate and server use the exact loaded image ID. Deployment files are additional working-tree infrastructure changes on `codex/vds-production-setup`, not claimed to be part of the original commit.

| Artifact | Version / identity |
|---|---|
| Application | `symbols-server:c76fcae8e802`, ID `sha256:b6c9209c294b02bf6fe0d5814a73f901b2a9bd74a8980f334c62d94fbc188da9` |
| Node base | 24.19.0-bookworm-slim, `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df` |
| PostgreSQL | 17.11-bookworm, `sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826` |
| Caddy | 2.11.7-alpine, `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f` |

Official version/security sources checked: [Node release index](https://nodejs.org/dist/index.json), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/), [Caddy releases](https://github.com/caddyserver/caddy/releases). PostgreSQL17 current patch was 17.11. Node24.19 includes preceding 24.18.1 security release; later 24.20/24.21 were marked non-security and not adopted in this installation. Caddy advanced from repository baseline2.11.2 to patch2.11.7. These checks are not a vulnerability-scanner certification.

## Configuration and permissions

Release `/opt/symbols/releases/c76fcae8e802`, current symlink, root-owned files. `/etc/symbols/production.env` is root-only0600; distinct random 256-bit passwords/token generated on-host only once. `symbols-compose` supplies absolute config/env paths. Avoid `compose config` without `--quiet`, unfiltered `docker inspect`, or dumping the environment because they reveal secrets.

Database network172.30.42.0/24 is internal. Frontend172.30.41.0/24 is distinct from observed host/Docker routes. Server .2, Caddy .3, exact TRUST_PROXY172.30.41.3. Memory limits DB1536MiB, app768MiB, migration512MiB, Caddy256MiB; app pool10. Restart unless-stopped, 30-second graceful stop. Docker health `unhealthy` does not itself trigger restart; monitor emits a local fault and operator investigates/restarts the named service.

`symbols_owner` and `symbols_app` are NOSUPERUSER/NOCREATEDB/NOCREATEROLE. Runtime has no database/schema CREATE; profiles DML allowed, content SELECT only. Current app tables have no runtime sequence dependency; schema_migrations sequence is migration-only. Future migrations must explicitly grant required DML/sequences and preserve content read-only access: the present grant script is an explicit table allowlist, not an automatic promise to cover future objects.

## Verification

- `/health`, `/ready` success against production without creating players; DB health and stable volume verified.
- Production owner migration/seed/grants repeated safely. Runtime permissions independently inspected.
- `verify-runtime.sh` uses a separate internal network, PostgreSQL container and disposable named test volume; detects pre-existing reserved names before cleanup. No test connects to production DB for writes.
- 16 final domain/integration tests passed: transactions/rollback, concurrent purchases/turns, idempotency, no duplicate rewards, scheduler persistence, HTTP contract, WS cursor replay/revocation, avatar/account deletion. Legacy SQLite import test excluded from the final run. An initial harness run accidentally included its synthetic fixture test in the disposable database only; no source-system access or production import occurred.
- Full production dump restored into separate `symbols_test_restored`, verified 0/676/456/3, granted runtime permissions, started same image. Synthetic dump/restore verified authentication and complete profile/balance/inventory/match/cursor equality.
- Test DB restart retained data and runtime-role `/ready` recovered; restored runtime registration/bootstrap/trial/idempotency checked separately. Graceful app stop exit0. Test containers/network/volume removed.
- No load/capacity test was performed. WS transport was checked privately; public TLS/WSS/DNS acceptance is pending domain/email.

Reproducible test scripts live in deploy; runtime test also needs `Server/test` copied as release `verification-tests` including fixtures. Final complete runtime/restore verification took13seconds;16passed,0failed, with legacy test excluded by CLI (Node did not count the excluded child as skipped). Logs `/root/symbols-runtime-tests.log` contain safe test results. Initial test-harness errors (missing fixture/permissions, tmpfs persistence, long test nickname) were fixed; no application code was changed to hide failures.

Remaining launch conditions: owner domain and ACME email, DNS checks, external backup snapshot+restore, independent external port verification, reviewed resource capacity. Enable public traffic only after those conditions. CI/CD, constrained deploy credentials and Android release remain separate tasks.
