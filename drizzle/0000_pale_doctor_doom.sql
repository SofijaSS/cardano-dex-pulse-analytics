CREATE TABLE `dashboard_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text,
	`generated_at` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`refresh_lease_until` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_error` text
);
