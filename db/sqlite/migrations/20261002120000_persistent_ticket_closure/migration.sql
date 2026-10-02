ALTER TABLE "tickets" ADD COLUMN "closeRequestedAt" DATETIME;
ALTER TABLE "tickets" ADD COLUMN "closeScheduledAt" DATETIME;
ALTER TABLE "tickets" ADD COLUMN "closeRequestedById" TEXT;
ALTER TABLE "tickets" ADD COLUMN "closeRequestReason" TEXT;
ALTER TABLE "tickets" ADD COLUMN "closeRequestMessageId" TEXT;
