CREATE TABLE `system_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`level` varchar(20) NOT NULL DEFAULT 'info',
	`category` varchar(50) NOT NULL DEFAULT 'system',
	`title` varchar(200) NOT NULL,
	`message` text,
	`entityType` varchar(50),
	`entityId` int,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_logs_id` PRIMARY KEY(`id`)
);
