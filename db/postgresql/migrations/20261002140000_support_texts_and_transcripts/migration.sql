ALTER TABLE "guilds" ADD COLUMN "textOverrides" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "categories" ADD COLUMN "textOverrides" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "guilds" ADD COLUMN "transcriptChannel" TEXT;
ALTER TABLE "tickets" ADD COLUMN "transcriptPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "transcriptMessageId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "transcriptAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "transcriptNextAttemptAt" TIMESTAMP(3);
