export function up(pgm){pgm.sql(`
CREATE TABLE profiles (
 id text PRIMARY KEY, nick text NOT NULL, legacy_data jsonb NOT NULL DEFAULT '{}',
 seen timestamptz NOT NULL DEFAULT now(), created timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vaults (
 profile_id text PRIMARY KEY REFERENCES profiles ON DELETE CASCADE,
 data jsonb NOT NULL, balance_cents bigint NOT NULL CHECK(balance_cents BETWEEN 0 AND 9007199254740991),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), cursor bigint NOT NULL DEFAULT 0,
 event_floor bigint NOT NULL DEFAULT 0,
 CHECK(jsonb_typeof(data)='object'), CHECK((data->>'balanceCents')::numeric=balance_cents)
);
CREATE TABLE account_sessions (
 token_hash text PRIMARY KEY, profile_id text NOT NULL REFERENCES profiles ON DELETE CASCADE,
 created timestamptz NOT NULL DEFAULT now(), expires timestamptz NOT NULL, revoked timestamptz
);
CREATE INDEX sessions_profile ON account_sessions(profile_id);
CREATE INDEX sessions_expiry ON account_sessions(expires);
CREATE TABLE recovery (profile_id text PRIMARY KEY REFERENCES profiles ON DELETE CASCADE,code_hash text UNIQUE NOT NULL);
CREATE TABLE recovery_limits (key text PRIMARY KEY,count integer NOT NULL,expires timestamptz NOT NULL);
CREATE TABLE arenas (
 id text PRIMARY KEY,mode text NOT NULL CHECK(mode IN ('play','duel','team','trial','local','room')),
 status text NOT NULL CHECK(status IN ('waiting','setup','play','done')),data jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),updated timestamptz NOT NULL,
 due_at timestamptz,code text, size text NOT NULL
);
CREATE INDEX arenas_queue ON arenas(mode,size,updated) WHERE status='waiting';
CREATE UNIQUE INDEX arenas_room ON arenas(code) WHERE status='waiting' AND code IS NOT NULL;
CREATE INDEX arenas_due ON arenas(due_at) WHERE due_at IS NOT NULL;
CREATE TABLE arena_members (
 arena_id text REFERENCES arenas ON DELETE CASCADE, profile_id text REFERENCES profiles ON DELETE CASCADE,
 PRIMARY KEY(arena_id,profile_id)
);
CREATE INDEX members_profile ON arena_members(profile_id);
CREATE TABLE listings (
 id text PRIMARY KEY,seller text REFERENCES profiles ON DELETE SET NULL,symbol text NOT NULL,skin text,
 price_cents bigint NOT NULL CHECK(price_cents BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK(status IN ('open','sold','cancelled')),buyer text REFERENCES profiles ON DELETE SET NULL,
 created timestamptz NOT NULL, CHECK(status<>'open' OR seller IS NOT NULL)
);
CREATE INDEX listings_market ON listings(symbol,price_cents,created,id) WHERE status='open';
CREATE INDEX listings_prices ON listings(price_cents,created,id) WHERE status='open';
CREATE INDEX listings_seller ON listings(seller,status);
CREATE TABLE commands (
 owner text REFERENCES profiles ON DELETE CASCADE,key text,kind text NOT NULL,request_hash text NOT NULL,
 result jsonb NOT NULL,created timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner,key)
);
CREATE INDEX commands_expiry ON commands(created);
CREATE TABLE events (
 owner text REFERENCES profiles ON DELETE CASCADE,cursor bigint NOT NULL,payload jsonb NOT NULL,
 created timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,cursor)
);
CREATE INDEX events_expiry ON events(created);
CREATE TABLE game_content (category text,key text,payload jsonb NOT NULL,version text NOT NULL,PRIMARY KEY(category,key));
CREATE TABLE game_content_links (
 category text,key text,relation text,target_category text,target_key text,
 PRIMARY KEY(category,key,relation,target_category,target_key),
 FOREIGN KEY(category,key) REFERENCES game_content, FOREIGN KEY(target_category,target_key) REFERENCES game_content
);
CREATE TABLE content_versions(version text PRIMARY KEY, applied timestamptz NOT NULL DEFAULT now());
CREATE TABLE imports (digest text PRIMARY KEY,report jsonb NOT NULL,created timestamptz NOT NULL DEFAULT now());
CREATE TABLE legacy_rows (source_table text,id text,data jsonb NOT NULL,PRIMARY KEY(source_table,id));
CREATE TABLE blocks (owner text REFERENCES profiles ON DELETE CASCADE,target text REFERENCES profiles ON DELETE CASCADE,
 PRIMARY KEY(owner,target),CHECK(owner<>target));
CREATE TABLE reports (id text PRIMARY KEY,owner text REFERENCES profiles ON DELETE SET NULL,
 target text REFERENCES profiles ON DELETE SET NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'open',created timestamptz DEFAULT now());
`);}
export function down(){throw Error('Destructive rollback disabled: restore a verified backup or use a forward migration.');}
