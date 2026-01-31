CREATE TABLE `deviceShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','viewer') NOT NULL DEFAULT 'viewer',
	`sharedBy` int NOT NULL,
	`sharedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deviceShares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `devices` RENAME COLUMN `userId` TO `ownerId`;--> statement-breakpoint
ALTER TABLE `devices` DROP FOREIGN KEY `devices_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `deviceShares` ADD CONSTRAINT `deviceShares_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deviceShares` ADD CONSTRAINT `deviceShares_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deviceShares` ADD CONSTRAINT `deviceShares_sharedBy_users_id_fk` FOREIGN KEY (`sharedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;