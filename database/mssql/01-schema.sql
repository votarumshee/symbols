-- Prepared during export from the final original migrations; no production rows.
IF OBJECT_ID(N'dbo.account_sessions', N'U') IS NULL
CREATE TABLE [account_sessions] (
  [token_hash] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [profile_id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [created] bigint NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'account_sessions_profile' AND object_id=OBJECT_ID(N'dbo.account_sessions'))
CREATE INDEX [account_sessions_profile] ON [account_sessions] ([profile_id]);
IF OBJECT_ID(N'dbo.arenas', N'U') IS NULL
CREATE TABLE [arenas] (
  [id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [mode] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [status] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [data] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [revision] bigint NOT NULL DEFAULT 0,
  [updated] bigint NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'arenas_queue' AND object_id=OBJECT_ID(N'dbo.arenas'))
CREATE INDEX [arenas_queue] ON [arenas] ([status],[mode],[updated]);
IF OBJECT_ID(N'dbo.listings', N'U') IS NULL
CREATE TABLE [listings] (
  [id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [seller] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [symbol] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [price] numeric(22,2) NOT NULL,
  [status] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [buyer] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL,
  [created] bigint NOT NULL,
  [price_cents] bigint NULL,
  [skin] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'listings_seller' AND object_id=OBJECT_ID(N'dbo.listings'))
CREATE INDEX [listings_seller] ON [listings] ([seller],[status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'listings_market' AND object_id=OBJECT_ID(N'dbo.listings'))
CREATE INDEX [listings_market] ON [listings] ([status],[symbol],[price]);
IF OBJECT_ID(N'dbo.matches', N'U') IS NULL
CREATE TABLE [matches] (
  [id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [code] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL,
  [kind] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [status] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [p0] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [p1] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL,
  [revision] bigint NOT NULL DEFAULT 0,
  [state] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [updated] bigint NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'matches_waiting' AND object_id=OBJECT_ID(N'dbo.matches'))
CREATE INDEX [matches_waiting] ON [matches] ([kind],[status],[updated]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'matches_code' AND object_id=OBJECT_ID(N'dbo.matches'))
CREATE UNIQUE INDEX [matches_code] ON [matches] ([code]) WHERE [code] IS NOT NULL;
IF OBJECT_ID(N'dbo.operations', N'U') IS NULL
CREATE TABLE [operations] (
  [id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [owner] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [created] bigint NOT NULL
);
IF OBJECT_ID(N'dbo.profiles', N'U') IS NULL
CREATE TABLE [profiles] (
  [id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [token_hash] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [nick] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [data] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [seen] bigint NOT NULL,
  [match_id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL,
  [last_opponent] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'profiles_seen' AND object_id=OBJECT_ID(N'dbo.profiles'))
CREATE INDEX [profiles_seen] ON [profiles] ([seen]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'profiles_token' AND object_id=OBJECT_ID(N'dbo.profiles'))
CREATE UNIQUE INDEX [profiles_token] ON [profiles] ([token_hash]);
IF OBJECT_ID(N'dbo.recovery', N'U') IS NULL
CREATE TABLE [recovery] (
  [profile_id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [code_hash] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'recovery_code' AND object_id=OBJECT_ID(N'dbo.recovery'))
CREATE UNIQUE INDEX [recovery_code] ON [recovery] ([code_hash]);
IF OBJECT_ID(N'dbo.recovery_limits', N'U') IS NULL
CREATE TABLE [recovery_limits] (
  [key] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [count] bigint NOT NULL,
  [expires] bigint NOT NULL
);
IF OBJECT_ID(N'dbo.vaults', N'U') IS NULL
CREATE TABLE [vaults] (
  [profile_id] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [data] nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [revision] bigint NOT NULL DEFAULT 0
);
