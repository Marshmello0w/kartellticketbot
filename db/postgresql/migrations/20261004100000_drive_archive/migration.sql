-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "driveArchiveEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "driveArchives" (
    "leaseUntil" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "rootFolderId" TEXT NOT NULL,
    "folderId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'collecting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "zipFileId" TEXT,
    "zipSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zipSession" TEXT,
    "zipUploadedBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zipLocalReady" BOOLEAN NOT NULL DEFAULT false,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "discordDelivered" BOOLEAN NOT NULL DEFAULT false,
    "transcriptChannelId" TEXT,
    "backfilledAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "errorCode" TEXT,

    CONSTRAINT "driveArchives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driveAssets" (
    "leaseUntil" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localReady" BOOLEAN NOT NULL DEFAULT false,
    "driveFileId" TEXT,
    "uploadSession" TEXT,
    "uploadedBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driveAssets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driveArchives_state_nextAttemptAt_idx" ON "driveArchives"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "driveArchives_expiresAt_idx" ON "driveArchives"("expiresAt");

-- CreateIndex
CREATE INDEX "driveAssets_state_nextAttemptAt_idx" ON "driveAssets"("state", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "driveAssets" ADD CONSTRAINT "driveAssets_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "driveArchives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
