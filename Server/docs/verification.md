# Verification — 2026-10-06

## Ready and checked locally

Source baseline `8c953993d57a887112a75c4b0a69bb2a376ea1eb`; implementation branch `feature/server-postgresql`. Original Initial commit and author remain in ancestry. Runnable baseline retained in `.reference/` and export branch; original Worker remains under `legacy/`. Live Sites deployment, D1 and R2 were not modified.

Standalone Server installation and syntax/dependency checks pass. Dependencies are exact and locked (npm reported zero known vulnerabilities at installation). Docker builds from Server alone on Linux, Node 24.19.0; local host Node 24.16.0. Compose provisioning, separate owner/app roles, migrations/seed and readiness/register/trial smoke passed; both roles report `rolsuper=false`, `rolcreatedb=false`. The application does not auto-migrate. PostgreSQL image is 17.11-bookworm. Current release verified at https://www.postgresql.org/docs/17/release.html.

16 automated tests pass including the PostgreSQL parent suite: catalog counts/Cyrillic/FKs/probability totals; deterministic differential combat against original engine for both board sizes; team kings and trial strict timing; repeatable migration/seed and failed migration rollback; rejection of forged progress; exact-cent market and two buyers; receipt replay and parameter conflict; simultaneous moves; normal win/quest rewards exactly once; injected outbox failure rolls back the economic mutation; two schedulers, offline bots/timers and restart; all modes, training and local ownership; cases/upgrades/skins/avatars; WS replay/revocation/expired cursor; synthetic old-format import and recovery; blocking/deletion. Synthetic imports preserve a non-UUID ID, 425 cents, inventory, skin ownership and open escrow and are repeat-safe. Real accounts are not present in the public export.

Custom-format pg_dump and pg_restore `--single-transaction --exit-on-error` into a different empty database passed: 676 content records, 101 synthetic profiles, 10100 total cents. No production data involved. Physical files are separate, no PNG Base64 in the new runtime.

## Load measurements

Hardware: Windows, Intel i5-11400 @2.60 GHz, 12 logical CPUs, 34,144,509,952 bytes RAM; PostgreSQL 17.11 in Docker Desktop Linux. The Node process includes HTTP/WS load generator and server, so CPU/RSS are combined and are **not VPS capacity figures**. Each final run creates its own isolated database. Duration approximately 15–16 seconds, small board, half duel/half trial, one eligible placement per ~900 ms, 20% WS reconnect once. This is a short burst test, not a soak. Payload counts exclude HTTP headers, TLS, WS framing and ping/pong bytes. Original baseline runs the unchanged built Worker with an in-memory SQLite D1 adapter over loopback HTTP; it polls every ~900 ms. Both use the same mode mix and placement rule; independent bots and timing produce different operation counts, so compare RPS/bytes per second, not just totals.

| Measured | v3 50 | original 50 | v3 200 | original 200 |
|---|---:|---:|---:|---:|
| Seconds | 15.50 | 15.81 | 16.22 | 15.34 |
| HTTP requests | 555 | 1390 | 1440 | 4522 |
| HTTP RPS | 35.81 | 87.90 | 88.80 | 294.82 |
| HTTP payload bytes | 121174 | 4863660 | 313520 | 15393406 |
| WS application frames | 1110 | 0 | 2880 | 0 |
| WS payload bytes | 561757 | 0 | 1454119 | 0 |
| HTTP p95 ms | 119.1 | 49.2 | 350.4 | 160.9 |
| Event p95 ms, from command start | 105 | — | 388 | — |
| Technical errors | 0 | 0 | 0 | 0 |
| Node CPU, % of one core | 2.01 | 4.74 | 5.01 | 17.82 |
| Peak Node RSS bytes | 208035840 | 176082944 | 255787008 | 296042496 |
| PostgreSQL DB bytes | 10748431 | — | 14385679 | — |

Event timing starts before transaction execution, so includes lock wait/commit and is an upper bound on post-commit delivery. HTTP RPS decreased about 59% at 50 and 70% at 200; combined application payload rate decreased about 86% and 89%. The 90% HTTP reduction target is **not met in this command-heavy scenario**, and HTTP p95 <200 ms is **not met at 200**. Event <500 ms and technical error <1% targets passed on this local burst. Further batching/round-trip reduction and realistic VPS measurement are required before making a capacity claim. No Redis/Kafka/Kubernetes added.

Database writes are separately captured in raw reports: v3 PostgreSQL 50 = 2909 inserts /2570 updates /1 delete, 200 = 5498/6341/1; original SQLite total changes 4442 and 14454. PostgreSQL statistics are asynchronous and may include late initialization counters, so these values are **diagnostic, not an exact apples-to-apples write reduction claim**. New durable receipts/events intentionally add writes. Exact test-only row triggers were used for the idle check instead: 200 connected players over 23 seconds including a real 20-second ping/pong cycle made **zero HTTP requests, zero application event frames and zero database row writes**. Heartbeat does not save profile/last_seen. Idle profile polling is removed completely.

EXPLAIN ANALYZE with 20000 synthetic listings and 20000 events uses listings_prices (0.032 ms), events_pkey (0.038 ms) and arenas_due (0.028 ms) in the captured local plan. No N+1 participant fetch: vaults lock in one sorted query; the bounded 2/4-player write loop persists per-recipient events. Raw sanitized measurements are in `docs/measurements/`; scripts reproduce them in ignored `reports/`.

## Needs staging

Run the same tests on the intended VPS (target 4 vCPU/8 GB), longer mixed-mode/large-board soak, real mobile WSS reconnect/background lifecycle, TLS/DNS/firewall, two full application processes, network interruption and connection-pool recovery. PostgreSQL locks were exercised through independent connections/pools; this does not replace a multi-process deployment soak. Tune 200-player p95 and repeat the comparison at realistic player action frequency. Validate account-deletion page and backup retention against the actual store listing/privacy policy. Exercise external restic destination/timer and encrypted restore; only local PostgreSQL dump/restore is verified. Do not merge/deploy this draft automatically.

## Awaits private data / accesses / owner approval

Full consistent private D1 export, R2 files/checksums if used, real domain/VPS/backup storage and access. Review import rejects and reconciliation on that dump, verify existing-account recovery on Android, then separately approve the write freeze and production cutover. Live account preservation is **not completed** until that real import and reconciliation. The runbook documents no-dual-write policy and rollback after new writes; no automatic reverse-sync is claimed.

Known behavior changes: unknown/progress/sync/promo/instant commands rejected; conflicts return 409 instead of silent refreshed success; matchmaking respects board size and blocked players; sale batches capped at 100; internal inventories/flags removed from DTOs; account deletion cancels shared games without extra rewards. Old arbitrary avatar uploads stay disabled. Already earned items/claims remain stored but disabled cheats are not reactivated.
