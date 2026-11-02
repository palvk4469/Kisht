-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OFFICER', 'BRANCH_MANAGER', 'HEAD');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('hi', 'en');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('CALL', 'VISIT');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('PAID', 'PROMISE', 'NOT_REACHABLE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "PromiseStatus" AS ENUM ('PENDING', 'KEPT', 'PARTIAL', 'BROKEN');

-- CreateEnum
CREATE TYPE "ReminderRecipient" AS ENUM ('BORROWER', 'OFFICER');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('QUEUED', 'SENT_MOCK', 'DEFERRED_WINDOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('IMPORT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OFFICER',
    "branchId" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'hi',
    "phone" TEXT,
    "dailyCapacity" INTEGER NOT NULL DEFAULT 25,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "officer_pincode" (
    "officerId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,

    CONSTRAINT "officer_pincode_pkey" PRIMARY KEY ("officerId","pincode")
);

-- CreateTable
CREATE TABLE "borrower" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "preferredLang" "Locale" NOT NULL DEFAULT 'hi',

    CONSTRAINT "borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan" (
    "id" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "emiAmount" INTEGER NOT NULL,
    "contactPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_snapshot" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "outstanding" INTEGER NOT NULL,
    "dpd" INTEGER NOT NULL,
    "lastPaymentDate" DATE,
    "lastPaymentAmount" INTEGER,
    "importBatchId" TEXT,

    CONSTRAINT "loan_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "source" "AssignmentSource" NOT NULL,
    "assignedById" TEXT,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_score" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "expectedLoss" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "limitedHistory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_override" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_attempt" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "deviceAt" TIMESTAMP(3) NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "allowed" BOOLEAN NOT NULL,
    "blockReason" TEXT,

    CONSTRAINT "contact_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "attemptId" TEXT,
    "type" "OutcomeType" NOT NULL,
    "amount" INTEGER,
    "note" TEXT,
    "deviceAt" TIMESTAMP(3) NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,

    CONSTRAINT "outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promise_to_pay" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "dueDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PromiseStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promise_to_pay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "PaymentSource" NOT NULL DEFAULT 'IMPORT',

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "promiseId" TEXT NOT NULL,
    "recipient" "ReminderRecipient" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'QUEUED',
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_log" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reminderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_run" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_branchId_role_idx" ON "user"("branchId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "branch_code_key" ON "branch"("code");

-- CreateIndex
CREATE INDEX "officer_pincode_pincode_idx" ON "officer_pincode"("pincode");

-- CreateIndex
CREATE INDEX "borrower_pincode_idx" ON "borrower"("pincode");

-- CreateIndex
CREATE UNIQUE INDEX "loan_loanNo_key" ON "loan"("loanNo");

-- CreateIndex
CREATE INDEX "loan_branchId_idx" ON "loan"("branchId");

-- CreateIndex
CREATE INDEX "import_batch_asOfDate_idx" ON "import_batch"("asOfDate");

-- CreateIndex
CREATE INDEX "loan_snapshot_asOfDate_dpd_idx" ON "loan_snapshot"("asOfDate", "dpd");

-- CreateIndex
CREATE UNIQUE INDEX "loan_snapshot_loanId_asOfDate_key" ON "loan_snapshot"("loanId", "asOfDate");

-- CreateIndex
CREATE INDEX "assignment_loanId_endedAt_idx" ON "assignment"("loanId", "endedAt");

-- CreateIndex
CREATE INDEX "assignment_officerId_endedAt_idx" ON "assignment"("officerId", "endedAt");

-- CreateIndex
CREATE INDEX "priority_score_asOfDate_idx" ON "priority_score"("asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "priority_score_loanId_asOfDate_modelVersion_key" ON "priority_score"("loanId", "asOfDate", "modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "list_override_officerId_date_loanId_key" ON "list_override"("officerId", "date", "loanId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_attempt_clientId_key" ON "contact_attempt"("clientId");

-- CreateIndex
CREATE INDEX "contact_attempt_loanId_correctedAt_idx" ON "contact_attempt"("loanId", "correctedAt");

-- CreateIndex
CREATE INDEX "contact_attempt_officerId_correctedAt_idx" ON "contact_attempt"("officerId", "correctedAt");

-- CreateIndex
CREATE UNIQUE INDEX "outcome_clientId_key" ON "outcome"("clientId");

-- CreateIndex
CREATE INDEX "outcome_loanId_correctedAt_idx" ON "outcome"("loanId", "correctedAt");

-- CreateIndex
CREATE INDEX "outcome_officerId_correctedAt_idx" ON "outcome"("officerId", "correctedAt");

-- CreateIndex
CREATE UNIQUE INDEX "promise_to_pay_outcomeId_key" ON "promise_to_pay"("outcomeId");

-- CreateIndex
CREATE INDEX "promise_to_pay_loanId_status_idx" ON "promise_to_pay"("loanId", "status");

-- CreateIndex
CREATE INDEX "promise_to_pay_dueDate_status_idx" ON "promise_to_pay"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_loanId_date_key" ON "payment"("loanId", "date");

-- CreateIndex
CREATE INDEX "reminder_status_scheduledFor_idx" ON "reminder"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_at_idx" ON "audit_log"("actorId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_run_weekStart_modelVersion_key" ON "backtest_run"("weekStart", "modelVersion");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_pincode" ADD CONSTRAINT "officer_pincode_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_snapshot" ADD CONSTRAINT "loan_snapshot_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_snapshot" ADD CONSTRAINT "loan_snapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_score" ADD CONSTRAINT "priority_score_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_override" ADD CONSTRAINT "list_override_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_override" ADD CONSTRAINT "list_override_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_override" ADD CONSTRAINT "list_override_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempt" ADD CONSTRAINT "contact_attempt_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_attempt" ADD CONSTRAINT "contact_attempt_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome" ADD CONSTRAINT "outcome_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "contact_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_promiseId_fkey" FOREIGN KEY ("promiseId") REFERENCES "promise_to_pay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
