CREATE TABLE `arenas` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arenas_queue` ON `arenas` (`status`,`mode`,`updated`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`seller` text NOT NULL,
	`symbol` text NOT NULL,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`buyer` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listings_market` ON `listings` (`status`,`symbol`,`price`);--> statement-breakpoint
CREATE INDEX `listings_seller` ON `listings` (`seller`,`status`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vaults` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
