ALTER TABLE `generation_batches` ADD `autoApproveThreshold` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_batches` ADD `startedAt` timestamp;--> statement-breakpoint
ALTER TABLE `generation_batches` ADD `completedAt` timestamp;--> statement-breakpoint
ALTER TABLE `generation_items` ADD `title` varchar(512);--> statement-breakpoint
ALTER TABLE `generation_items` ADD `generatedTitle` varchar(512);--> statement-breakpoint
ALTER TABLE `generation_items` ADD `wordCount` int;--> statement-breakpoint
ALTER TABLE `generation_items` ADD `qualityScore` int;--> statement-breakpoint
ALTER TABLE `generation_items` ADD `retryCount` int DEFAULT 0 NOT NULL;