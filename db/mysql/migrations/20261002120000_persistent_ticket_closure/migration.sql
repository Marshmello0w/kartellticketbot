ALTER TABLE `tickets` ADD COLUMN `closeRequestedAt` DATETIME(3) NULL;
ALTER TABLE `tickets` ADD COLUMN `closeScheduledAt` DATETIME(3) NULL;
ALTER TABLE `tickets` ADD COLUMN `closeRequestedById` VARCHAR(19) NULL;
ALTER TABLE `tickets` ADD COLUMN `closeRequestReason` TEXT NULL;
ALTER TABLE `tickets` ADD COLUMN `closeRequestMessageId` VARCHAR(19) NULL;
