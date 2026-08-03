CREATE TABLE `weekly_reporting_snapshots` (
	`week_key` text PRIMARY KEY NOT NULL,
	`scheduled_for` text NOT NULL,
	`captured_at` text NOT NULL,
	`source_generated_at` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL
);
