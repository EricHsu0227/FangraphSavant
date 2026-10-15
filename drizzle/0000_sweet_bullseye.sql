CREATE TABLE `preference_chunks` (
	`user_id` text NOT NULL,
	`part` integer NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `preference_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`write_token` text NOT NULL,
	`updated_at` text NOT NULL
);
