-- AlterEnum
ALTER TYPE "ImportStatus" ADD VALUE 'SUPERSEDED';
-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "skippedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" JSONB;
-- CreateIndex
CREATE INDEX "import_batch_status_asOfDate_idx" ON "import_batch"("status", "asOfDate");
-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
