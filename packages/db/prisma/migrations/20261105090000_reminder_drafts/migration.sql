-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('AI', 'TEMPLATE');

-- AlterEnum
ALTER TYPE "ContactChannel" ADD VALUE 'MESSAGE';

-- CreateTable
CREATE TABLE "reminder_draft" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "lang" "Locale" NOT NULL,
    "template" TEXT NOT NULL,
    "source" "DraftSource" NOT NULL,
    "body" TEXT NOT NULL,
    "fallbackReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "reminder_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_draft_loanId_officerId_createdAt_idx" ON "reminder_draft"("loanId", "officerId", "createdAt");

-- AddForeignKey
ALTER TABLE "reminder_draft" ADD CONSTRAINT "reminder_draft_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_draft" ADD CONSTRAINT "reminder_draft_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

