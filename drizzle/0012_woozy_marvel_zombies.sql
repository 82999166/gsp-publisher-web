ALTER TABLE `generation_batches` ADD `autoQueue` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_batches` ADD `templateId` int;