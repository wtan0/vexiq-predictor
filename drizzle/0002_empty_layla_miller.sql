ALTER TABLE `team_events` ADD `eventCode` varchar(32);--> statement-breakpoint
ALTER TABLE `team_events` ADD `teamworkRank` int;--> statement-breakpoint
ALTER TABLE `team_events` ADD `avgTeamworkScore` float;--> statement-breakpoint
ALTER TABLE `team_matches` ADD `eventCode` varchar(32);--> statement-breakpoint
ALTER TABLE `team_matches` ADD `tied` boolean;--> statement-breakpoint
CREATE INDEX `idx_team_events_eventCode` ON `team_events` (`eventCode`);--> statement-breakpoint
CREATE INDEX `idx_team_matches_eventCode` ON `team_matches` (`eventCode`);