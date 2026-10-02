-- AlterTable
ALTER TABLE `guilds` ADD COLUMN `driveArchiveEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `driveArchives` (
    `leaseUntil` DATETIME(3) NULL,
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `rootFolderId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'collecting',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `zipFileId` VARCHAR(191) NULL,
    `zipSize` DOUBLE NOT NULL DEFAULT 0,
    `zipSession` TEXT NULL,
    `zipUploadedBytes` DOUBLE NOT NULL DEFAULT 0,
    `zipLocalReady` BOOLEAN NOT NULL DEFAULT false,
    `complete` BOOLEAN NOT NULL DEFAULT false,
    `discordDelivered` BOOLEAN NOT NULL DEFAULT false,
    `transcriptChannelId` VARCHAR(191) NULL,
    `backfilledAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,
    `errorCode` VARCHAR(191) NULL,

    INDEX `driveArchives_state_nextAttemptAt_idx`(`state`, `nextAttemptAt`),
    INDEX `driveArchives_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driveAssets` (
    `leaseUntil` DATETIME(3) NULL,
    `id` VARCHAR(191) NOT NULL,
    `archiveId` VARCHAR(191) NOT NULL,
    `assetKey` TEXT NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `sourceUrl` TEXT NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `relativePath` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `size` DOUBLE NOT NULL DEFAULT 0,
    `localReady` BOOLEAN NOT NULL DEFAULT false,
    `driveFileId` VARCHAR(191) NULL,
    `uploadSession` TEXT NULL,
    `uploadedBytes` DOUBLE NOT NULL DEFAULT 0,
    `state` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,
    `errorCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `driveAssets_state_nextAttemptAt_idx`(`state`, `nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driveAssets` ADD CONSTRAINT `driveAssets_archiveId_fkey` FOREIGN KEY (`archiveId`) REFERENCES `driveArchives`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
