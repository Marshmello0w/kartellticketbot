-- Existing tickets stay with human support; only new tickets start AI triage.
ALTER TABLE "tickets" ADD COLUMN "aiLeaseUntil" TIMESTAMP(3);
ALTER TABLE "guilds" ADD COLUMN "aiSupportEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guilds" ADD COLUMN "aiKnowledge" TEXT NOT NULL DEFAULT '';
ALTER TABLE "categories" ADD COLUMN "aiSupportEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "categories" ADD COLUMN "aiKnowledge" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tickets" ADD COLUMN "aiState" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "tickets" ADD COLUMN "aiReplies" INTEGER NOT NULL DEFAULT 0;
UPDATE "tickets" SET "aiState" = 'human';

CREATE TABLE "aiBudgets" (
    "id" TEXT PRIMARY KEY,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "spentMicros" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "aiCharges" (
    "id" TEXT PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "amountMicros" INTEGER NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "aiProviders" (
    "id" TEXT PRIMARY KEY,
    "blockedUntil" TIMESTAMP(3),
    "errorCode" TEXT
);

CREATE TABLE "aiTasks" (
    "id" TEXT PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "initial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "response" TEXT,
    "tier" TEXT,
    "errorCode" TEXT,
    "discordMessageId" TEXT
);

CREATE INDEX "aiBudgets_endsAt_idx" ON "aiBudgets"("endsAt");
CREATE INDEX "aiTasks_state_createdAt_idx" ON "aiTasks"("state", "createdAt");
CREATE INDEX "aiTasks_ticketId_idx" ON "aiTasks"("ticketId");
