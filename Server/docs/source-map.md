# Source baseline and behavior

Baseline: `8c953993d57a887112a75c4b0a69bb2a376ea1eb`, original author Alexandr Vologodskiy. GPL-3.0 retained. A runnable local archive is in ignored `.reference/`; recreate with `git archive` of this commit into a separate directory, then `npm ci --ignore-scripts`, `npm run build`, `node scripts/smoke-local.mjs`.

Current path: `dist/index.html` → `dist/next.mjs` → `/api/v2/*` → original `server/v2.mjs`. Root files and the export branch remain reference material. The new runtime is entirely inside `Server/src`.

| Area | Original source | Current routes/behavior |
|---|---|---|
| Account | worker.mjs | register, recover, recovery-code; SHA-256 of bearer tokens and nine-digit codes |
| Profile | v2.mjs | profile, nickname, avatar, frame, skin, buy-skin, buy-avatar, upgrade |
| Economy | v2.mjs, money/cases/upgrades/skins | buy-case, open-case, sell, buy, cancel, market |
| Matches | v2.mjs, arena-engine.mjs, engine.mjs | start, action, poll, leave; play/duel/team/trial/local/room |
| Progress | progression.mjs, entitlements.mjs | XP, clean/blocks quests, five-game trials, level cases, frames |
| Runtime | worker.mjs | D1 prepare/batch, R2 avatars, Cloudflare IP, bundled assets |

Both sizes are `[28,20]` and `[10,14]` (height,width). Team has four seats, sides alternate by seat parity. Local has two seats owned by one account. Queue fills with bots at 8 seconds; rooms wait for humans. Bot turn delay 450 ms; human timeout strictly after 90 seconds. Training is first play at level zero. Original board renderer shows both halves: no fog of war exists in this baseline. Inventories, account credentials, internal reward flags and future random decisions are private.

Capture tests before migration: baseline HTTP register/profile/trial survives restart (passed). Historical sword-electricity test expects a different stock and levels-x2-sessions enables a disabled promo (failed in unchanged baseline); these are not acceptance authorities. Original skin-market, upgrades and fire-avatar suites are relevant. Differential tests use fixed time and controlled randomness against extracted baseline rules.

Known required changes: reject client progress entirely; disable instant/promo; PostgreSQL transactions replace conditional D1 batches; strict revision conflict errors replace silent success; scheduler advances matches without polling; public projection replaces raw state. Session expiry/revocation, account deletion, reports and blocking are new.

Tables: profiles → identity plus legacy JSON; vaults → current progress and checked integer balance; arenas → current games and persistent due time; listings → integer cents and escrow; account_sessions/recovery → managed credentials; recovery_limits → shared limits. matches and operations retained only as private legacy archive rows during import. New commands, per-user event counters/outbox, imports, blocks and reports provide retries, synchronization and moderation.
