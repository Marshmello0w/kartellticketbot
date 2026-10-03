ALTER TABLE `categories` ADD COLUMN `aiResponseLanguage` VARCHAR(191) NOT NULL DEFAULT 'auto';
ALTER TABLE `tickets` ADD COLUMN `aiLanguage` VARCHAR(191);
ALTER TABLE `tickets` ADD COLUMN `aiLanguageSeed` TEXT;
ALTER TABLE `tickets` ADD COLUMN `aiLanguageSourceId` VARCHAR(191);
CREATE TABLE `faqEntries` (
    `id` VARCHAR(191) PRIMARY KEY,
    `guildId` VARCHAR(191) NOT NULL,
    `categoryId` INTEGER,
    `categoryName` VARCHAR(191) NOT NULL,
    `sourceTicketId` VARCHAR(191) NOT NULL,
    `sourceTicketNumber` INTEGER NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `language` VARCHAR(191) NOT NULL,
    `evidence` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `reviewedById` VARCHAR(191),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    CONSTRAINT `faqEntries_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `faqJobs` (
    `id` VARCHAR(191) PRIMARY KEY,
    `guildId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `ticketNumber` INTEGER NOT NULL,
    `categoryId` INTEGER,
    `categoryName` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `ticketKey` VARCHAR(191),
    `state` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3),
    `leaseUntil` DATETIME(3),
    `errorCode` VARCHAR(191),
    `messageCount` INTEGER NOT NULL DEFAULT 0,
    `truncated` BOOLEAN NOT NULL DEFAULT false,
    `proposals` INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT `faqJobs_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `guilds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `faqEntries_guildId_status_idx` ON `faqEntries`(`guildId`, `status`);
CREATE UNIQUE INDEX `faqJobs_ticketKey_key` ON `faqJobs`(`ticketKey`);
CREATE INDEX `faqJobs_state_createdAt_idx` ON `faqJobs`(`state`, `createdAt`);
CREATE INDEX `faqJobs_guildId_createdAt_idx` ON `faqJobs`(`guildId`, `createdAt`);
