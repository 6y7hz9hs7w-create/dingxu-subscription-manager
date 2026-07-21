ALTER TABLE `subscriptions` ADD `owner_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `subscriptions_owner_email_idx` ON `subscriptions` (`owner_email`);