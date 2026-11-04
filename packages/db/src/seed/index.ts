// Seeds the database with the demo world: branches, staff with demo logins,
// and six months of simulated collections history (see simulate.ts).
//
//   pnpm db:seed                 # "today" = the current IST day
//   SEED_TODAY=2026-11-02 pnpm db:seed
//
// Wipes all data first. Refuses to run with NODE_ENV=production unless
// SEED_ALLOW_RESET=true is also set (for the hosted demo).

import {
  addDays,
  formatDay,
  formatRupees,
  type IsoDay,
  isIsoDay,
  istDayOf,
  istDayStart,
  planReminders,
  renderReminder,
  toDbDate,
} from "@kisht/domain";
import { CURRENT_MODEL, factsAt, type LoanEvents, scoreLoan } from "@kisht/domain/scoring";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../client.js";
import { loadRootEnv } from "../env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { provisionUser } from "../provision.js";
import { BRANCHES, STAFF } from "./reference.js";
import { eventsByLoan } from "./scoringEvents.js";
import { simulate } from "./simulate.js";

loadRootEnv();

const BATCH = 5000;
const EMPTY_EVENTS: LoanEvents = { snapshots: [], promises: [], outcomes: [] };

const userId = (key: string) => `usr_${key}`;
const branchId = (code: string) => `br_${code.toLowerCase()}`;

async function inBatches<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) await write(rows.slice(i, i + BATCH));
}

async function wipe(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

export async function seed(prisma: PrismaClient, today: IsoDay, demoPassword: string) {
  const sim = simulate(today);
  await wipe(prisma);

  await prisma.branch.createMany({
    data: BRANCHES.map((b) => ({ id: branchId(b.code), code: b.code, name: b.name, city: b.city })),
  });

  const password = await hashPassword(demoPassword);
  for (const s of STAFF) {
    await provisionUser(
      prisma,
      {
        id: userId(s.key),
        name: s.name,
        email: s.email,
        role: s.role,
        locale: s.locale,
        branchId: s.branch ? branchId(s.branch) : null,
        pincodes: s.pincodes ?? [],
      },
      password,
    );
  }

  await inBatches(sim.borrowers, (data) => prisma.borrower.createMany({ data }));
  await inBatches(sim.loans, (chunk) =>
    prisma.loan.createMany({
      data: chunk.map((l) => ({
        id: l.id,
        loanNo: l.loanNo,
        borrowerId: l.borrowerId,
        branchId: branchId(l.branch),
        emiAmount: l.emiAmount,
        contactPaused: l.contactPaused,
      })),
    }),
  );

  // One committed import per day, as if the loan system export had been
  // uploaded every morning by the head of collections.
  const days = [...new Set(sim.snapshots.map((s) => s.asOfDate))].sort();
  const countByDay = new Map<string, number>();
  for (const s of sim.snapshots) countByDay.set(s.asOfDate, (countByDay.get(s.asOfDate) ?? 0) + 1);
  await prisma.importBatch.createMany({
    data: days.map((d) => ({
      id: `imp_${d}`,
      asOfDate: toDbDate(d),
      fileName: `overdue_${d}.csv`,
      uploadedById: userId("anil.mehta"),
      rowCount: countByDay.get(d) ?? 0,
      errorCount: 0,
      status: "COMMITTED" as const,
      createdAt: new Date(istDayStart(d).getTime() + 7 * 60 * 60_000),
      committedAt: new Date(istDayStart(d).getTime() + 7 * 60 * 60_000 + 60_000),
    })),
  });

  await inBatches(sim.snapshots, (chunk) =>
    prisma.loanSnapshot.createMany({
      data: chunk.map((s) => ({
        loanId: s.loanId,
        asOfDate: toDbDate(s.asOfDate),
        outstanding: s.outstanding,
        dpd: s.dpd,
        lastPaymentDate: s.lastPaymentDate ? toDbDate(s.lastPaymentDate) : null,
        lastPaymentAmount: s.lastPaymentAmount,
        importBatchId: `imp_${s.asOfDate}`,
      })),
    }),
  );

  await inBatches(sim.payments, (chunk) =>
    prisma.payment.createMany({
      data: chunk.map((p) => ({ loanId: p.loanId, date: toDbDate(p.date), amount: p.amount })),
    }),
  );

  await inBatches(sim.assignments, (chunk) =>
    prisma.assignment.createMany({
      data: chunk.map((a) => ({
        loanId: a.loanId,
        officerId: userId(a.officer),
        source: "AUTO" as const,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
      })),
    }),
  );

  // A few imperfect records, by position so the simulation itself is untouched:
  // the activity log has real exceptions to show a manager.
  const attemptNo = new Map(sim.attempts.map((a, i) => [a.id, i]));
  const NO_GPS_EVERY = 41;
  const FAR_VISIT_EVERY = 67;
  const WRONG_CLOCK_EVERY = 151;
  const fixFor = (a: (typeof sim.attempts)[number]) => {
    const n = attemptNo.get(a.id) ?? 0;
    if (a.channel !== "VISIT") return { lat: a.lat, lng: a.lng, accuracyM: a.accuracyM };
    if (n % NO_GPS_EVERY === 0) return { lat: null, lng: null, accuracyM: null };
    if (n % FAR_VISIT_EVERY === 0) return { lat: a.lat + 0.03, lng: a.lng, accuracyM: a.accuracyM };
    return { lat: a.lat, lng: a.lng, accuracyM: a.accuracyM };
  };
  const deviceAtFor = (a: (typeof sim.attempts)[number]) =>
    (attemptNo.get(a.id) ?? 0) % WRONG_CLOCK_EVERY === 0
      ? new Date(a.at.getTime() + 40 * 60_000)
      : a.at;

  await inBatches(sim.attempts, (chunk) =>
    prisma.contactAttempt.createMany({
      data: chunk.map((a) => ({
        id: a.id,
        clientId: `seed-${a.id}`,
        loanId: a.loanId,
        officerId: userId(a.officer),
        channel: a.channel,
        deviceAt: deviceAtFor(a),
        correctedAt: a.at,
        receivedAt: a.receivedAt,
        ...fixFor(a),
        allowed: a.allowed,
        blockReason: a.blockReason,
      })),
    }),
  );

  await inBatches(sim.outcomes, (chunk) =>
    prisma.outcome.createMany({
      data: chunk.map((o) => ({
        id: o.id,
        clientId: `seed-${o.id}`,
        loanId: o.loanId,
        officerId: userId(o.officer),
        attemptId: o.attemptId,
        type: o.type,
        amount: o.amount,
        note: o.note,
        deviceAt: o.at,
        correctedAt: o.at,
        receivedAt: o.receivedAt,
        lat: o.lat,
        lng: o.lng,
        accuracyM: o.accuracyM,
      })),
    }),
  );

  await inBatches(sim.promises, (chunk) =>
    prisma.promiseToPay.createMany({
      data: chunk.map((p) => ({
        id: p.id,
        loanId: p.loanId,
        outcomeId: p.outcomeId,
        dueDate: toDbDate(p.dueDate),
        amount: p.amount,
        status: p.status,
        paidAmount: p.paidAmount,
        resolvedAt: p.resolvedOn ? istDayStart(p.resolvedOn) : null,
        createdAt: p.createdAt,
      })),
    }),
  );

  // Reminders as they'd have gone out: planned from each recent promise, sent if
  // their moment has passed (this morning counts as before opening).
  const morning = new Date(istDayStart(today).getTime() + 7 * 60 * 60_000);
  const recentFrom = addDays(today, -14);
  const loanById = new Map(sim.loans.map((l) => [l.id, l]));
  const borrowerById = new Map(sim.borrowers.map((b) => [b.id, b]));
  const reminders = sim.promises
    .filter((p) => p.dueDate >= recentFrom)
    .flatMap((p) => {
      const loan = loanById.get(p.loanId);
      const borrower = loan && borrowerById.get(loan.borrowerId);
      if (!loan || !borrower) return [];
      const vars = {
        borrowerName: borrower.name,
        amount: formatRupees(p.amount),
        date: formatDay(p.dueDate, "hi"),
        loanNo: loan.loanNo,
      };
      return planReminders(p.dueDate, p.createdAt).map((r) => {
        const settled =
          p.status !== "PENDING" && p.resolvedOn !== null && istDayStart(p.resolvedOn) <= r.at;
        const sent = !settled && r.at <= morning;
        return {
          promiseId: p.id,
          recipient: r.recipient,
          scheduledFor: r.at,
          status: settled
            ? ("CANCELLED" as const)
            : sent
              ? ("SENT_MOCK" as const)
              : ("QUEUED" as const),
          sentAt: sent ? r.at : null,
          body: renderReminder(r.template, "hi", vars),
        };
      });
    });
  await inBatches(reminders, (data) => prisma.reminder.createMany({ data }));

  // Scores for every day on record, so lists and the back-test have history.
  const events = eventsByLoan(sim);
  const scores = sim.snapshots.flatMap((snap) => {
    const facts = factsAt(events.get(snap.loanId) ?? EMPTY_EVENTS, snap.asOfDate);
    if (!facts) return [];
    const score = scoreLoan(CURRENT_MODEL, facts);
    return [
      {
        loanId: snap.loanId,
        asOfDate: toDbDate(snap.asOfDate),
        modelVersion: score.modelVersion,
        probability: score.probability,
        expectedLoss: score.expectedLoss,
        reasons: score.reasons,
        limitedHistory: score.limitedHistory,
      },
    ];
  });
  await inBatches(scores, (data) => prisma.priorityScore.createMany({ data }));

  return sim;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_RESET !== "true") {
    throw new Error(
      "Refusing to wipe a production database. Set SEED_ALLOW_RESET=true to override.",
    );
  }
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 8) {
    throw new Error(
      "Set DEMO_PASSWORD (8+ characters) in .env: it becomes every demo user's password.",
    );
  }
  const today = process.env.SEED_TODAY ?? istDayOf(new Date());
  if (!isIsoDay(today)) throw new Error(`SEED_TODAY must be YYYY-MM-DD, got ${today}`);

  const prisma = createPrismaClient();
  const started = Date.now();
  try {
    const sim = await seed(prisma, today, demoPassword);
    const overdueToday = sim.snapshots.filter((s) => s.asOfDate === today).length;
    console.log(
      `Seeded ${sim.loans.length} loans, ${sim.snapshots.length} snapshots, ` +
        `${sim.outcomes.length} outcomes, ${sim.promises.length} promises ` +
        `(${overdueToday} overdue as of ${today}) in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
    );
    console.log(`Demo logins: ${STAFF.map((s) => s.email).join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
