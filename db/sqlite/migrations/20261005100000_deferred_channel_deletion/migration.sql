ALTER TABLE "tickets" ADD COLUMN "channelDeletePending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "closeCapturePending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "channelDeleteAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "channelDeleteNextAttemptAt" DATETIME;
CREATE INDEX "tickets_channelDeletePending_channelDeleteNextAttemptAt_idx" ON "tickets"("channelDeletePending", "channelDeleteNextAttemptAt");
