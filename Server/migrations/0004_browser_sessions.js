export function up(pgm){pgm.sql(`
CREATE TABLE browser_sessions (
 id_hash text PRIMARY KEY, active_profile text REFERENCES profiles(id) ON DELETE SET NULL,
 expires timestamptz NOT NULL, created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX browser_sessions_expiry ON browser_sessions(expires);
CREATE TABLE browser_accounts (
 browser_id text NOT NULL REFERENCES browser_sessions(id_hash) ON DELETE CASCADE,
 profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 token_hash text NOT NULL REFERENCES account_sessions(token_hash) ON DELETE CASCADE,
 PRIMARY KEY(browser_id,profile_id)
);
`);}
export function down(pgm){pgm.sql('DROP TABLE browser_accounts; DROP TABLE browser_sessions;');}
