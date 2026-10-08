# VDS preparation for the first shared web / Capacitor release

Verified 2026-10-08 on 135.106.172.96. Infrastructure is prepared; the application release has not been activated. The existing production API remains on its previous image and database migration level 3. No production test accounts were created and no game data was imported or reset.

## Applied infrastructure

- Runtime configuration now resides at `/opt/symbols/releases/infra-web-20261008T171816Z`, selected by `/opt/symbols/current`. Previous runtime: `/opt/symbols/releases/c76fcae8e802`.
- Caddy mounts `/srv/symbols-web` read-only and imports `/srv/symbols-web/caddy/*.caddy`. Mounting the parent keeps future `current` symlink switches visible without recreating the container for each web release.
- Web assets are staged under `/srv/symbols-web/releases/ca92f14255a9d1727a7604ac2e29aac6cacffb4f95a61852c3d9a7623cbe7bb7`. No `current` web release is selected yet.
- `/srv/symbols-web/prepared/web-active.caddy` contains the reviewed site configuration. It is outside the active import directory. Browser `/api/web/v3/*` and public policy routes use the same host; metrics are not exposed by this web route.
- `WEB_ORIGIN=https://symbols.votarumshee.com` is prepared in the root-only production environment for the next application start. The running application was not recreated.
- The local backup script now includes the imported web routing directory in `configuration.tar`. Immutable web assets must remain available as release artifacts or be rebuilt from the matching source and lockfile; they are not duplicated in every database backup.
- Only Caddy was recreated. The application and PostgreSQL containers remained healthy and running throughout. `/ready` returned the unchanged content version `6ce99aba116be01d15816dccb4f85613ba314a8fb8c78ae1da70cb33d79f7c56` afterward. Production counts at verification: 5 profiles, 3 migrations.

Root-only rollback checkpoint: `/var/lib/symbols/web-preparation/20261008T171816Z`. It contains the previous environment and runtime path. Restore those and recreate only Caddy if reverting this infrastructure preparation; do not restore an old database over newer player data.

## Candidate and isolated restore acceptance

Candidate server image, built on the VDS from the reviewed source archive:

`sha256:62900956b06158c32e647dc3c994cb4a433893fc15a248831a7e35f2038f0c94`

Temporary tag: `symbols-server:webview-candidate-20261008`. This is a staged source candidate, not a claim that a merged Git commit has already been released. Match or rebuild it against the accepted PR before activation.

Source archive SHA256: `87e6a4756c74b94765b3fec44d61bdf8428c98618983af424d1dae4910d90b23`.
Web archive SHA256: `ef54c7b54006d058a16acb10e6fc91b52c415cfb35d2dadc6ec257867f48d14a`.

`verify-web-prepared.sh` restored a fresh real production dump into a separate PostgreSQL container on a new internal Docker network. It applied migration 0004, seeded reference data, and applied grants using the candidate image. All five restored profiles were preserved. Synthetic HTTP tests ran only inside this disposable database and passed cookie login/multiple accounts, Secure/HttpOnly/Strict flags, CSRF and stale-account rejection, moderation, native Bearer compatibility, and runtime role restrictions. Temporary database/container/network were removed afterward.

Tested dump SHA256: `38fdabc9d9b08901aba28899e161e30a43f3228e7e84ff0f84b1aeec98c8abb4`.
Protected VDS evidence: `/var/lib/symbols/web-preparation-20261008/restore-check.log` and `build.log`. They contain no printed credentials. A first checker run attempted to read the owner-only migration journal using the runtime role; the checker was corrected to read it as administrator. Application privileges were not broadened.

Compose validation, active Caddy configuration, and the prepared web Caddyfile passed validation. For `.caddy` filenames explicitly use `caddy validate --adapter caddyfile --config ...`.

## Remaining activation steps

1. Accept the PR into the agreed primary branch; the repository currently uses `main`, and no `master` exists. Rebuild or verify immutable application/web artifacts against the accepted source.
2. Set the DNS A record `symbols.votarumshee.com` to `135.106.172.96`. At preparation time it still resolved to Porkbun parking addresses `207.207.210.23`, `.36`, `.50`. Verify public DNS before requesting TLS.
3. Create and verify a fresh backup, record current image/configuration, update `SYMBOLS_IMAGE` and `GIT_COMMIT` using protected files, run the migration/seed/grants service, then start the new application and verify readiness and native API compatibility. Preserve all existing database volumes and profiles.
4. Select the web release with a relative symlink `current -> releases/<assetVersion>` inside `/srv/symbols-web`. Install the prepared host configuration into `caddy/symbols.caddy`, validate the complete Caddy configuration, and reload Caddy. Verify trusted HTTPS, matching content versions, policy pages, and browser authentication using a staging environment before production traffic.
5. If application activation fails, use a schema-compatible previous server image and prior web symlink/configuration. Migration 0004 is additive; keep its tables when rolling back application code. Do not downgrade Android or uninstall to simulate rollback.

The existing six backup/monitor timers remain enabled. An initial manual backup request met the scheduled upload lock and exited 75; a subsequent run succeeded. Fresh post-change backup: `20261008T171948Z`, including the web routing directory. Its external upload result is recorded in the operational follow-up below.

Deployment credentials for automated production release have not been granted to GitHub. The PR workflow builds and tests artifacts; production delivery remains an explicit release step.

## Operational follow-up

Google Drive upload completed successfully at 17:23:57 UTC / 20:23:57 Moscow: two fresh snapshots, including the post-change backup, in 248 seconds. Transient storage HTTP 500 responses succeeded on retry; they did not leave a failed backup. The local backup, monitor, and external upload services were checked after preparation. No failed units remained. The Docker mount inspection confirmed `/srv/symbols-web` has `RW=false` inside Caddy.
