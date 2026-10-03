-- Existing tickets stay with human support; only new tickets start AI triage.
ALTER TABLE `tickets` ADD COLUMN `aiLeaseUntil` DATETIME(3);
ALTER TABLE `guilds` ADD COLUMN `aiSupportEnabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `guilds` ADD COLUMN `aiKnowledge` TEXT NULL;
ALTER TABLE `categories` ADD COLUMN `aiSupportEnabled` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `categories` ADD COLUMN `aiKnowledge` TEXT NULL;
ALTER TABLE `tickets` ADD COLUMN `aiState` VARCHAR(191) NOT NULL DEFAULT 'active';
ALTER TABLE `tickets` ADD COLUMN `aiReplies` INTEGER NOT NULL DEFAULT 0;
UPDATE `tickets` SET `aiState` = 'human';
UPDATE `guilds` SET `aiKnowledge` = '' WHERE `aiKnowledge` IS NULL;
UPDATE `categories` SET `aiKnowledge` = '' WHERE `aiKnowledge` IS NULL;
ALTER TABLE `guilds` MODIFY `aiKnowledge` TEXT NOT NULL;
ALTER TABLE `categories` MODIFY `aiKnowledge` TEXT NOT NULL;

CREATE TABLE `aiBudgets` (
    `id` VARCHAR(191) PRIMARY KEY,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `spentMicros` INTEGER NOT NULL DEFAULT 0,
    `blocked` BOOLEAN NOT NULL DEFAULT false
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `aiCharges` (
    `id` VARCHAR(191) PRIMARY KEY,
    `budgetId` VARCHAR(191) NOT NULL,
    `amountMicros` INTEGER NOT NULL,
    `settled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `aiProviders` (
    `id` VARCHAR(191) PRIMARY KEY,
    `blockedUntil` DATETIME(3),
    `errorCode` VARCHAR(191)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `aiTasks` (
    `id` VARCHAR(191) PRIMARY KEY,
    `ticketId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `initial` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseUntil` DATETIME(3),
    `response` TEXT,
    `tier` VARCHAR(191),
    `errorCode` VARCHAR(191),
    `discordMessageId` VARCHAR(191)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `aiBudgets_endsAt_idx` ON `aiBudgets`(`endsAt`);
CREATE INDEX `aiTasks_state_createdAt_idx` ON `aiTasks`(`state`, `createdAt`);
CREATE INDEX `aiTasks_ticketId_idx` ON `aiTasks`(`ticketId`);
