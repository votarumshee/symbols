CREATE TABLE `recovery` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_code` ON `recovery` (`code_hash`);--> statement-breakpoint
CREATE TABLE `recovery_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
