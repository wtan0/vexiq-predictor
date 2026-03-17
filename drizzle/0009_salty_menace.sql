CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`label` varchar(128),
	`createdByOpenId` varchar(64) NOT NULL,
	`createdByName` text,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`useCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `invite_uses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationId` int NOT NULL,
	`acceptedByOpenId` varchar(64) NOT NULL,
	`acceptedByName` text,
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invite_uses_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_invite_uses` UNIQUE(`invitationId`,`acceptedByOpenId`)
);
--> statement-breakpoint
CREATE INDEX `idx_invitations_token` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `idx_invitations_createdBy` ON `invitations` (`createdByOpenId`);--> statement-breakpoint
CREATE INDEX `idx_invite_uses_invitationId` ON `invite_uses` (`invitationId`);