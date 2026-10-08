# K05: API and PostgreSQL functional acceptance

Executed locally against a newly created temporary database, then dropped. No production records or credentials were used. `tests/functions-v3.test.mjs` sends tested commands through Fastify HTTP injection, including request schemas, native authentication, rate limits, and command transactions. SQL is used only to seed synthetic inventory/wallets and controlled endgame fixtures, then to verify persisted results. These are **API/DB checks**, not evidence of UI taps or device rendering. Web UI and Android evidence must be listed separately in transition acceptance.

Run from repository root:

```powershell
$env:TEST_DATABASE_URL='postgres://symbols_test@127.0.0.1:5457/postgres'
node --test WebClient/tests/functions-v3.test.mjs
npm --prefix Server test
```

Without `TEST_DATABASE_URL`, database suites explicitly skip; such a run does not satisfy these checks.

| Scenario | Status | Test/evidence |
|---|---|---|
| Play/tutorial, duel, room, team, trial, local; both 10×14 and 28×20 | PASS API | `all six modes on both sizes`; API snapshot mode/size, created arena |
| Tutorial server advice, kings and both owned local seats | PASS API | Same test, advice text/move, setup king cells and seats `[0,1]` |
| Real duel/room peers and team 2×2, other-player changes | PASS API | Same test registers 2/4 human identities, places all kings, real command from owner, peer board/cursor event checked |
| Eight directions | PASS API | `eight directed placements...`; every direction 0–7 checked in snapshot and SQL board |
| Erase, teleport source/target + selected direction | PASS API | Source becomes null, target has moved arrow with direction 3, erase clears cell, teleport stock consumed once |
| Angry | PASS API | Inventory decremented once, extra=2, first follow-up retains actor, second advances actor |
| Results/history/quests/rewards exactly once | PASS API | `normal room win...`; controlled pending-shot fixture resolved by API move, replay same key, XP=1200, +300 cents, clean/blocks quests, one history record |
| Level/case milestone | PASS API | Same test; level 10 fixture, real nickname command awards milestone once, second command does not repeat reward |
| Trial ranking / local non-economic result | PASS API | `trial result...`; controlled trial endgame resolved by scheduler bot, rank progress +20, one trial result; leaving local adds zero XP/currency |
| Market skin sale/buy/cancel, exact cents | PASS API | `market skin sale...`; ownership transfer/removal/return, wallet delta and listing SQL status |
| Market filter/sort/pagination | PASS API | 61 sword listings + circle; 60+1 distinct pages, null final cursor, filter all sword, descending numeric prices |
| Block/unblock effect | PASS API | Same test; blocked seller hidden, direct buy rejected 403, unblocked buy succeeds; blocked room join rejected then allowed |
| Cases | PASS API | `cases, upgrade/max...`; case price debit, inventory drop +1, owned case -1, same-key opening returns same receipt |
| Upgrade and max | PASS API | Level advancement + exact maxUpgrade cost, stale old upgrade level rejected |
| Frame/avatar/skin | PASS API | Frame 2/null accepted and locked frame 30 rejected; paid avatar purchase, owned selection, buy/equip/default skin; persisted SQL wallet/fields match |
| Reports and blocked list persistence/privacy | PASS API | `Server/test/browser-auth.test.mjs`: report row owner/target, list survives switch, other account sees its own empty list, unblock row removed |
| Account recovery/logout/delete | PASS API | Browser auth suite + native regression; revoked credentials no longer authenticate, delete removes profile/mappings |
| Public privacy/support/deletion paths | PASS HTTP | Browser auth suite checks same-host HTML, API-host redirect, cookie deletion module without Bearer |

The controlled win fixtures do not claim a full naturally played match, visual effects correctness, all individual symbol interactions, physical device testing, or iOS testing. Existing server differential-engine tests exercise 200 seeded bot moves and both sizes separately.

## Additional real UI gameplay acceptance

`node WebClient/tests/gameplay.mjs` runs the main player through actual Playwright clicks, registering through the cookie UI. It reads only IDs/snapshots from browser fetch; no token is injected into JavaScript. It accepts `DATABASE_URL`, `SYMBOLS_WEB_ORIGIN`, and `SYMBOLS_API_ORIGIN` through `tests/environment.mjs` and refuses non-loopback test endpoints.

Executed on the local stand with all eight report scenarios PASS and no page errors:

- Tutorial entry, server king hint and highlighted cell, king placement, playable bot board.
- Human duel: main player king/move clicks, peer HTTP king/move, peer move appears via events.
- Trial entry, king/move clicks, trial label.
- Large local board: 560 rendered cells, both king clicks and a move.
- Every direction button 0–7 through directed `point` placement; persisted directions checked. Erase keeps the actor; angry consumes one inventory item and permits two UI moves before turn advance.
- Human room: actual UI tank placement/direction followed by the peer API response. A controlled enemy-block/endgame fixture produces a real resolved shot; results, +1200 XP, +300 cents, and quest counters are checked against PostgreSQL.
- Profile history displays that victory/opponent/XP.
- Quest screen displays both completed counters.

Evidence: `artifacts/transition/gameplay/report.json` and the eight referenced screenshots. `room-victory.png` was visually inspected: winning board, opponent 0 HP, result panel and exact rewards are visible. This adds browser UI evidence to the API matrix; it does not claim Android/iOS execution or a fully natural match from an unseeded inventory.
