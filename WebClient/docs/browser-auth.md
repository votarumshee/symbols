# Browser authentication contract

The browser uses same-origin `/api/web/v3/`. Android/iOS retain `/api/v3/` Bearer requests; browser cookies never authenticate native endpoints. Browser register/recover responses contain `{id, expiresIn}`, never Bearer tokens. Browser storage may hold account IDs, display state, and command journals, but no credential.

The `__Host-symbols-browser` cookie has `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`, no Domain. It contains a random opaque identifier. PostgreSQL stores its hash in `browser_sessions`; `browser_accounts` references hashed account sessions. Login survives browser/server restart for up to 30 days, subject to logout, recovery revocation, or expiry. Up to eight accounts can be attached. Register/recover and attachment are atomic, including account-limit failure. Scheduled maintenance removes expired browser sessions and cascading references.

- `GET account/sessions` → `{accounts:[{id,nick}],activeId}`; anonymous/expired → empty list and null.
- `POST account/new {}` clears active selection, retaining attached accounts.
- `POST account/switch {id}` selects an attached, unexpired, unrevoked account.
- `POST account/register {nick}`, `POST account/recover {code}` attach and select the resulting account.
- Authenticated `bootstrap`, `profile`, `matches/:id`, `catalog`, `market`, `moderation`, `changes?cursor=...`, `commands/:kind` match API v3.
- All authenticated browser requests require `X-Symbols-Account: <active ID>`; mismatch returns `409 ACCOUNT_CHANGED`. This prevents a delayed request from mutating another account after cookie selection changes.
- Every browser POST requires `Origin` exactly equal to `WEB_ORIGIN`; missing/null/cross-origin is `403 ORIGIN_DENIED`. Cross-site Fetch Metadata is also rejected. No CORS allowance is added. Changes use long poll, with session validation again before release.
- Command logout revokes and removes the current account from this browser. Delete requires `{confirm:true}` and erases account/session references. Recovery revokes all existing account sessions, including native clients. `moderation` returns `{blocked:[{id,nick}]}` for the caller only.

## Deployment preparation

Apply migration `0004_browser_sessions`, then `node scripts/grants.mjs` with the owner connection before deploying the new runtime. Compose forwards `WEB_ORIGIN`; configure exactly `https://symbols.votarumshee.com` (no trailing slash). Empty disables browser endpoints while native API remains available. Only HTTPS origins are accepted, except explicit HTTP loopback for local development.

Serve WebClient build and reverse-proxy `/api/web/v3/*` on that same host to Server, preserving Origin, Cookie, Set-Cookie, and `X-Symbols-Account`. Never strip the `/api/web/v3` prefix. Proxy public `/privacy`, `/support`, `/account-deletion` plus their `.html` forms, `/policy.css`, and `/account-deletion.mjs` to Server. The public account pages redirect from API host to `WEB_ORIGIN`; the deletion form uses cookie auth and never fetches a Bearer. Do not cache authenticated API responses. Keep `/metrics` private. Public policy text describes current data use; the operator must confirm actual retention/store disclosures before publication.

Rollback: keep the additive tables/migration and grants when rolling back server code; old native code ignores them. Do not downgrade/drop browser tables while active browser logins must remain usable. Disable WEB_ORIGIN/browser hosting together if reverting the web release.

## Local verification

`$env:TEST_DATABASE_URL='postgres://symbols_test@127.0.0.1:5457/postgres'; npm --prefix Server test`

The suite creates and drops unique local databases. `Server/test/browser-auth.test.mjs` checks cookie flags and opacity; restart; no Bearer response; CSRF; account switching/pinning; logout/recover/delete/expiry; revocation during long poll; atomic limit rollback; moderation; public pages. Existing PostgreSQL/native tests also run. Browser-context persistence/storage checks belong to the WebClient E2E suite.
