-- CreateTable
CREATE TABLE "driveArchives" (
    "leaseUntil" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "rootFolderId" TEXT NOT NULL,
    "folderId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'collecting',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "expiresAt" DATETIME,
    "zipFileId" TEXT,
    "zipSize" REAL NOT NULL DEFAULT 0,
    "zipSession" TEXT,
    "zipUploadedBytes" REAL NOT NULL DEFAULT 0,
    "zipLocalReady" BOOLEAN NOT NULL DEFAULT false,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "discordDelivered" BOOLEAN NOT NULL DEFAULT false,
    "transcriptChannelId" TEXT,
    "backfilledAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "errorCode" TEXT
);

-- CreateTable
CREATE TABLE "driveAssets" (
    "leaseUntil" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveId" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" REAL NOT NULL DEFAULT 0,
    "localReady" BOOLEAN NOT NULL DEFAULT false,
    "driveFileId" TEXT,
    "uploadSession" TEXT,
    "uploadedBytes" REAL NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driveAssets_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "driveArchives" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "guilds" ADD COLUMN "driveArchiveEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "driveArchives_state_nextAttemptAt_idx" ON "driveArchives"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "driveArchives_expiresAt_idx" ON "driveArchives"("expiresAt");

-- CreateIndex
CREATE INDEX "driveAssets_state_nextAttemptAt_idx" ON "driveAssets"("state", "nextAttemptAt");
