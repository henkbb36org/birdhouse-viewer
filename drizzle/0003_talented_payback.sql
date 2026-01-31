CREATE TABLE `motionVideos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`motionEventId` int,
	`filename` varchar(255) NOT NULL,
	`filepath` varchar(512) NOT NULL,
	`duration` int NOT NULL DEFAULT 5,
	`filesize` int NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `motionVideos_id` PRIMARY KEY(`id`),
	CONSTRAINT `motionVideos_filename_unique` UNIQUE(`filename`)
);
--> statement-breakpoint
ALTER TABLE `motionVideos` ADD CONSTRAINT `motionVideos_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `motionVideos` ADD CONSTRAINT `motionVideos_motionEventId_motionEvents_id_fk` FOREIGN KEY (`motionEventId`) REFERENCES `motionEvents`(`id`) ON DELETE set null ON UPDATE no action;