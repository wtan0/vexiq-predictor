CREATE TABLE `team_awards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamNumber` varchar(16) NOT NULL,
	`eventCode` varchar(32) NOT NULL,
	`eventName` text NOT NULL,
	`awardName` varchar(128) NOT NULL,
	`qualifiesFor` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_awards_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_team_awards` UNIQUE(`teamNumber`,`eventCode`,`awardName`)
);
--> statement-breakpoint
CREATE INDEX `idx_team_awards_teamNumber` ON `team_awards` (`teamNumber`);--> statement-breakpoint
CREATE INDEX `idx_team_awards_eventCode` ON `team_awards` (`eventCode`);