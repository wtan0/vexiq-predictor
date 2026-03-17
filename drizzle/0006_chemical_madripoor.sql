CREATE TABLE `team_sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamNumber` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`eventsFound` int DEFAULT 0,
	`matchRecords` int DEFAULT 0,
	`awardsFound` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_sync_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_team_sync_jobs_teamNumber` UNIQUE(`teamNumber`)
);
