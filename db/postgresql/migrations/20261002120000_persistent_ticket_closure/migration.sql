ALTER TABLE "tickets" ADD COLUMN "closeRequestedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "closeScheduledAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "closeRequestedById" TEXT;
ALTER TABLE "tickets" ADD COLUMN "closeRequestReason" TEXT;
ALTER TABLE "tickets" ADD COLUMN "closeRequestMessageId" TEXT;
