CREATE TABLE `sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` varchar(64) NOT NULL,
	`status` enum('running','success','error') NOT NULL,
	`recordsProcessed` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamNumber` varchar(16) NOT NULL,
	`eventName` text NOT NULL,
	`eventDate` timestamp,
	`eventRank` int,
	`driverScore` int,
	`autoScore` int,
	`skillsScore` int,
	`wpApSp` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamNumber` varchar(16) NOT NULL,
	`eventName` text NOT NULL,
	`matchName` varchar(64),
	`matchDate` timestamp,
	`partnerTeam` varchar(16),
	`allianceScore` int,
	`opponentScore` int,
	`won` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamNumber` varchar(16) NOT NULL,
	`teamName` text,
	`organization` text,
	`eventRegion` varchar(128),
	`country` varchar(128),
	`skillsRank` int,
	`skillsScore` int,
	`driverScore` int,
	`autoScore` int,
	`driverScoreAt` timestamp,
	`autoScoreAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_teamNumber_unique` UNIQUE(`teamNumber`)
);
--> statement-breakpoint
CREATE INDEX `idx_team_events_teamNumber` ON `team_events` (`teamNumber`);--> statement-breakpoint
CREATE INDEX `idx_team_matches_teamNumber` ON `team_matches` (`teamNumber`);--> statement-breakpoint
CREATE INDEX `idx_teams_teamNumber` ON `teams` (`teamNumber`);