-- Prepared during export from the final original migrations; no production rows.
CREATE TABLE IF NOT EXISTS "account_sessions" (
  "token_hash" text COLLATE "C" NOT NULL PRIMARY KEY,
  "profile_id" text COLLATE "C" NOT NULL,
  "created" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_sessions_profile" ON "account_sessions" ("profile_id");
CREATE TABLE IF NOT EXISTS "arenas" (
  "id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "mode" text COLLATE "C" NOT NULL,
  "status" text COLLATE "C" NOT NULL,
  "data" text COLLATE "C" NOT NULL,
  "revision" bigint NOT NULL DEFAULT 0,
  "updated" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "arenas_queue" ON "arenas" ("status","mode","updated");
CREATE TABLE IF NOT EXISTS "listings" (
  "id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "seller" text COLLATE "C" NOT NULL,
  "symbol" text COLLATE "C" NOT NULL,
  "price" numeric(22,2) NOT NULL,
  "status" text COLLATE "C" NOT NULL,
  "buyer" text COLLATE "C" NULL,
  "created" bigint NOT NULL,
  "price_cents" bigint NULL,
  "skin" text COLLATE "C" NULL
);
CREATE INDEX IF NOT EXISTS "listings_seller" ON "listings" ("seller","status");
CREATE INDEX IF NOT EXISTS "listings_market" ON "listings" ("status","symbol","price");
CREATE TABLE IF NOT EXISTS "matches" (
  "id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "code" text COLLATE "C" NULL,
  "kind" text COLLATE "C" NOT NULL,
  "status" text COLLATE "C" NOT NULL,
  "p0" text COLLATE "C" NOT NULL,
  "p1" text COLLATE "C" NULL,
  "revision" bigint NOT NULL DEFAULT 0,
  "state" text COLLATE "C" NOT NULL,
  "updated" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "matches_waiting" ON "matches" ("kind","status","updated");
CREATE UNIQUE INDEX IF NOT EXISTS "matches_code" ON "matches" ("code");
CREATE TABLE IF NOT EXISTS "operations" (
  "id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "owner" text COLLATE "C" NOT NULL,
  "created" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS "profiles" (
  "id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "token_hash" text COLLATE "C" NOT NULL,
  "nick" text COLLATE "C" NOT NULL,
  "data" text COLLATE "C" NOT NULL,
  "seen" bigint NOT NULL,
  "match_id" text COLLATE "C" NULL,
  "last_opponent" text COLLATE "C" NULL
);
CREATE INDEX IF NOT EXISTS "profiles_seen" ON "profiles" ("seen");
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_token" ON "profiles" ("token_hash");
CREATE TABLE IF NOT EXISTS "recovery" (
  "profile_id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "code_hash" text COLLATE "C" NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "recovery_code" ON "recovery" ("code_hash");
CREATE TABLE IF NOT EXISTS "recovery_limits" (
  "key" text COLLATE "C" NOT NULL PRIMARY KEY,
  "count" bigint NOT NULL,
  "expires" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS "vaults" (
  "profile_id" text COLLATE "C" NOT NULL PRIMARY KEY,
  "data" text COLLATE "C" NOT NULL,
  "revision" bigint NOT NULL DEFAULT 0
);
