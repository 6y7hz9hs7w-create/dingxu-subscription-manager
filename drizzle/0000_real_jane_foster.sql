CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`next_charge_date` text NOT NULL,
	`color` text DEFAULT '#28604F' NOT NULL,
	`mark` text DEFAULT '订' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reminder_days` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
