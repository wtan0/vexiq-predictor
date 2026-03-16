DROP INDEX `idx_team_events_eventCode` ON `team_events`;--> statement-breakpoint
ALTER TABLE `team_events` ADD CONSTRAINT `uniq_team_events_team_event` UNIQUE(`teamNumber`,`eventCode`);