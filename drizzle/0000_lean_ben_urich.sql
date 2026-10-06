CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`p0` text NOT NULL,
	`p1` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_code` ON `matches` (`code`);--> statement-breakpoint
CREATE INDEX `matches_waiting` ON `matches` (`kind`,`status`,`updated`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`nick` text NOT NULL,
	`data` text NOT NULL,
	`seen` integer NOT NULL,
	`match_id` text,
	`last_opponent` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_token` ON `profiles` (`token_hash`);--> statement-breakpoint
CREATE INDEX `profiles_seen` ON `profiles` (`seen`);