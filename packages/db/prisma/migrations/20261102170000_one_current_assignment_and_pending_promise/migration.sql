-- CreateIndex
CREATE UNIQUE INDEX "assignment_one_current_per_loan" ON "assignment"("loanId") WHERE ("endedAt" IS NULL);
-- CreateIndex
CREATE UNIQUE INDEX "promise_one_pending_per_loan" ON "promise_to_pay"("loanId") WHERE (status = 'PENDING');
