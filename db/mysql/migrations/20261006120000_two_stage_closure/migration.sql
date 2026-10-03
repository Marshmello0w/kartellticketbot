ALTER TABLE `tickets` ADD COLUMN `closeChannelPending` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `tickets` ADD COLUMN `closedControlMessageId` VARCHAR(191) NULL;
-- Preserve unfinished closures from the old automatic deletion flow.
UPDATE `tickets` SET `closeChannelPending` = true, `channelDeletePending` = false, `channelDeleteNextAttemptAt` = NULL WHERE `open` = false AND (`channelDeletePending` = true OR `closeCapturePending` = true);
