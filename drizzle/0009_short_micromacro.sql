DROP TABLE `generation_items`;--> statement-breakpoint
DROP TABLE `published_pages`;--> statement-breakpoint
DROP TABLE `system_logs`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `googleOAuthAccessToken` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `googleOAuthRefreshToken` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `googleOAuthExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `accounts` ADD `googleOAuthScope` text;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `publishMethod` enum('browser_automation','google_sites_api') DEFAULT 'google_sites_api' NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_batches` DROP COLUMN `autoApproveThreshold`;--> statement-breakpoint
ALTER TABLE `generation_batches` DROP COLUMN `autoQueue`;--> statement-breakpoint
ALTER TABLE `generation_batches` DROP COLUMN `startedAt`;--> statement-breakpoint
ALTER TABLE `generation_batches` DROP COLUMN `completedAt`;