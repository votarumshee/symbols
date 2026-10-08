# Server — «Символы», API v3

Independent Node.js 24 ES-module server, Fastify, PostgreSQL 17.11 and node-pg-migrate. `src/transport` handles HTTP/events and public DTOs; `services` runs commands; `domain` contains original JavaScript rules; `repositories` owns transactions; `jobs` persists and executes due turns. No `Client/`, DOM, localStorage, D1, R2 binding or `dist/` dependency. Static PNG files remain separate. GPL-3.0 and the original authorship are retained.

## Local startup

Install Node 24 (container pins 24.19.0) and PostgreSQL 17.11. Ask a database administrator to create a login `symbols_owner` with NOSUPERUSER NOCREATEDB NOCREATEROLE and a UTF8 database `symbols` owned by it. These are provisioning steps, not application startup. Set its password privately; do not put credentials in shell history.

```sh
cd Server
npm ci --ignore-scripts
cp .env.example .env
# Set DATABASE_URL in .env to your pre-created development database.
npm run db:migrate
npm run db:seed
npm run db:status
npm run build
npm start
```

PowerShell uses `Copy-Item .env.example .env`. Health: `/health`; readiness verifies matching seeded content at `/ready`. Register with `POST /api/v3/account/register` and `{ "nick": "Игрок" }`; store the returned token privately. Use Bearer auth for `/api/v3/bootstrap`, `POST /api/v3/commands/start` with `{ "mode":"trial", "small":true }` and a fresh `Idempotency-Key`. Use `contracts/` in the repository root to implement further actions. `/account-deletion` provides a recovery-code-authenticated web deletion path.

Migration `0001_init` creates every runtime structure. node-pg-migrate keeps `schema_migrations`, uses an advisory lock and an all-migrations transaction. Repeating migrate/seed is safe and never changes player data. Never edit applied migrations, run reset on startup, or give the runtime account DDL rights. Seed uses canonical `content/catalog.json`: 676 records and 456 FK-checked links, versioned by SHA-256. Combat and unbounded level formulas remain executable code. Initial test accounts are separate: `npm run dev:seed` (disabled in production).

## Tests and measurements

```sh
npm run build
node scripts/contracts.mjs --check
# Set TEST_DATABASE_URL to an isolated PostgreSQL test administrator.
npm test
# Integration suite creates/drops only a randomly named test database.
# Without TEST_DATABASE_URL it explicitly skips PostgreSQL integration.
```

Linux CI checks exact `Server` casing, standalone installation, contracts, tests and Docker build. For local measurements set DATABASE_URL to a disposable database whose name contains `test`, then `npm run load -- 50 15` and `npm run load -- 200 15`. Each run creates its own test DB. `node scripts/load-baseline.mjs 50 15` uses the runnable baseline at `../.reference` (override BASELINE_ROOT). Recreate it from the source-map instructions. `node scripts/explain.mjs` records plans for synthetic market/events in a rolled-back transaction. See `docs/verification.md` for measured results and limitations.

## Operations

See [deployment and backup](docs/deployment.md), [private import and cutover](docs/cutover.md), [source map and deviations](docs/source-map.md), [API compatibility](../contracts/compatibility.md). Compose requires a real domain and secrets; it does not buy infrastructure or change the live site. Migrations are an explicit one-off deployment step. New code cannot safely serve the old published v2 client; release the v3 client against the verified contract.

The root export scripts, `dist/`, database exports and `legacy/` retain the original Worker for comparison. They are not part of this project's build or Docker context. To rebuild that reference from this branch run the root `npm ci` and `npm run build`; it uses `legacy/` after the case-sensitive rename.
