-- Prepared during export from the final original migrations; no production rows.
CREATE TABLE IF NOT EXISTS "account_sessions" (
  "token_hash" TEXT NOT NULL PRIMARY KEY,
  "profile_id" TEXT NOT NULL,
  "created" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_sessions_profile" ON "account_sessions" ("profile_id");
CREATE TABLE IF NOT EXISTS "arenas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "arenas_queue" ON "arenas" ("status","mode","updated");
CREATE TABLE IF NOT EXISTS "listings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seller" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "buyer" TEXT NULL,
  "created" INTEGER NOT NULL,
  "price_cents" INTEGER NULL,
  "skin" TEXT NULL
);
CREATE INDEX IF NOT EXISTS "listings_seller" ON "listings" ("seller","status");
CREATE INDEX IF NOT EXISTS "listings_market" ON "listings" ("status","symbol","price");
CREATE TABLE IF NOT EXISTS "matches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "p0" TEXT NOT NULL,
  "p1" TEXT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL,
  "updated" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "matches_waiting" ON "matches" ("kind","status","updated");
CREATE UNIQUE INDEX IF NOT EXISTS "matches_code" ON "matches" ("code");
CREATE TABLE IF NOT EXISTS "operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "created" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "profiles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token_hash" TEXT NOT NULL,
  "nick" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "seen" INTEGER NOT NULL,
  "match_id" TEXT NULL,
  "last_opponent" TEXT NULL
);
CREATE INDEX IF NOT EXISTS "profiles_seen" ON "profiles" ("seen");
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_token" ON "profiles" ("token_hash");
CREATE TABLE IF NOT EXISTS "recovery" (
  "profile_id" TEXT NOT NULL PRIMARY KEY,
  "code_hash" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "recovery_code" ON "recovery" ("code_hash");
CREATE TABLE IF NOT EXISTS "recovery_limits" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expires" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "vaults" (
  "profile_id" TEXT NOT NULL PRIMARY KEY,
  "data" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0
);
