ALTER TABLE "categories" ADD COLUMN "aiResponseLanguage" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "tickets" ADD COLUMN "aiLanguage" TEXT;
ALTER TABLE "tickets" ADD COLUMN "aiLanguageSeed" TEXT;
ALTER TABLE "tickets" ADD COLUMN "aiLanguageSourceId" TEXT;
CREATE TABLE "faqEntries" (
    "id" TEXT PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "categoryId" INTEGER,
    "categoryName" TEXT NOT NULL,
    "sourceTicketId" TEXT NOT NULL,
    "sourceTicketNumber" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "faqEntries_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "faqJobs" (
    "id" TEXT PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "categoryName" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "ticketKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "leaseUntil" DATETIME,
    "errorCode" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "proposals" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "faqJobs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "faqEntries_guildId_status_idx" ON "faqEntries"("guildId", "status");
CREATE UNIQUE INDEX "faqJobs_ticketKey_key" ON "faqJobs"("ticketKey");
CREATE INDEX "faqJobs_state_createdAt_idx" ON "faqJobs"("state", "createdAt");
CREATE INDEX "faqJobs_guildId_createdAt_idx" ON "faqJobs"("guildId", "createdAt");
