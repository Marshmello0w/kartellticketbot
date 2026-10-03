ALTER TABLE `tickets` ADD COLUMN `channelDeletePending` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `closeCapturePending` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `channelDeleteAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `channelDeleteNextAttemptAt` DATETIME(3) NULL;
CREATE INDEX `tickets_channelDeletePending_channelDeleteNextAttemptAt_idx` ON `tickets`(`channelDeletePending`, `channelDeleteNextAttemptAt`);
