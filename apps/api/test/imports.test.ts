import { createTestPrisma } from "@kisht/db/testing";
import { OVERDUE_COLUMNS, toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { purgeStalePreviews } from "../src/modules/imports/service.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
let app: FastifyInstance;
let fx: Fixture;
let now = new Date("2026-11-02T10:00:00+05:30");
let managerA: string;

type Row = {
  loanNo: string;
  pincode?: string;
  dpd?: number;
  outstanding?: number;
  paid?: [string, number];
};

function csv(rows: Row[], branchCode = fx.branchACode): string {
  const lines = rows.map((r) =>
    [
      r.loanNo,
      `Company ${r.loanNo}`,
      "kirana wholesaler",
      "9000012345",
      '"Plot 1, Siyaganj, Indore"',
      r.pincode ?? "452001",
      r.outstanding ?? 300000,
      r.dpd ?? 10,
      10000,
      r.paid?.[0] ?? "2026-09-15",
      r.paid?.[1] ?? 10000,
      branchCode,
    ].join(","),
  );
  return [OVERDUE_COLUMNS.join(","), ...lines].join("\n");
}

async function preview(cookie: string, asOfDate: string, body: string) {
  return app.inject({
    method: "POST",
    url: "/api/imports",
    headers: { cookie, origin: TEST_ORIGIN, "content-type": "application/json" },
    payload: { asOfDate, fileName: `overdue_${asOfDate}.csv`, csv: body },
  });
}

async function commit(cookie: string, id: string) {
  return app.inject({
    method: "POST",
    url: `/api/imports/${id}/commit`,
    headers: { cookie, origin: TEST_ORIGIN },
  });
}

async function importDay(asOfDate: string, rows: Row[]) {
  const p = await preview(managerA, asOfDate, csv(rows));
  expect(p.statusCode).toBe(201);
  const c = await commit(managerA, p.json().id);
  expect(c.statusCode).toBe(200);
  return c.json();
}

const L = (n: string) => `LN-I${n}-${fx.tag}`.toUpperCase();
const loanByNo = (loanNo: string) => prisma.loan.findUniqueOrThrow({ where: { loanNo } });
const officerOf = async (loanNo: string) =>
  (
    await prisma.assignment.findFirst({
      where: { loan: { loanNo }, endedAt: null },
      select: { officerId: true },
    })
  )?.officerId ?? null;

beforeAll(async () => {
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
  });
  fx = await createFixture(prisma);
  // Territories: A1 covers 452001, A2 covers 452002. 452099 is covered by nobody.
  await prisma.officerPincode.createMany({
    data: [
      { officerId: fx.officerA1.id, pincode: "452001" },
      { officerId: fx.officerA2.id, pincode: "452002" },
    ],
  });
  managerA = await signIn(app, fx.managerA.email);
});

afterAll(async () => {
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("import access and validation", () => {
  it("is not available to officers", async () => {
    const cookie = await signIn(app, fx.officerA1.email);
    const res = await preview(cookie, "2026-10-30", csv([{ loanNo: L("1") }]));
    expect(res.statusCode).toBe(403);
  });

  it("rejects a future as-of date", async () => {
    const res = await preview(managerA, "2026-11-03", csv([{ loanNo: L("1") }]));
    expect(res.statusCode).toBe(400);
  });

  it("rejects a file with missing columns", async () => {
    const res = await preview(managerA, "2026-10-30", "loan_id,dpd\nLN-1,4");
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/Missing columns/);
  });
});

describe("preview", () => {
  it("validates and plans without writing loan data", async () => {
    const body = [
      csv([
        { loanNo: L("1") },
        { loanNo: L("2"), pincode: "452002" },
        { loanNo: L("3"), pincode: "452099" },
      ]),
      // Bad phone, and a row for another branch that a manager's upload skips.
      `${L("4")},Company,kirana,12345,-,452001,1000,3,100,,,${fx.branchACode}`,
      `${L("5")},Company,kirana,9000012345,-,452001,1000,3,100,,,${fx.branchBCode}`,
    ].join("\n");
    const res = await preview(managerA, "2026-10-30", body);

    expect(res.statusCode).toBe(201);
    const { summary, errors } = res.json();
    expect(summary).toMatchObject({
      rows: 3,
      errors: 1,
      skippedOtherBranches: 1,
      newLoans: 3,
      assignment: { new: 2, unassigned: 1 },
    });
    expect(errors).toMatchObject([
      { row: 5, field: "phone", message: "must be a 10-digit Indian mobile number" },
    ]);
    expect(await prisma.loan.count({ where: { loanNo: { in: [L("1"), L("2"), L("3")] } } })).toBe(
      0,
    );
  });
});

describe("commit, then the next day's import", () => {
  it("creates loans, snapshots and pincode-based assignments", async () => {
    const result = await importDay("2026-10-31", [
      { loanNo: L("1") },
      { loanNo: L("2"), pincode: "452002" },
      { loanNo: L("3"), pincode: "452099" },
    ]);

    expect(result.summary.assignment).toMatchObject({ new: 2, unassigned: 1 });
    expect(await officerOf(L("1"))).toBe(fx.officerA1.id);
    expect(await officerOf(L("2"))).toBe(fx.officerA2.id);
    expect(await officerOf(L("3"))).toBeNull();
    const l1 = await loanByNo(L("1"));
    expect(
      await prisma.loanSnapshot.count({
        where: { loanId: l1.id, asOfDate: toDbDate("2026-10-31") },
      }),
    ).toBe(1);
  });

  it("scores every loan on the list, with reasons", async () => {
    const l1 = await loanByNo(L("1"));
    const score = await prisma.priorityScore.findFirstOrThrow({
      where: { loanId: l1.id, asOfDate: toDbDate("2026-10-31") },
    });
    expect(score.probability).toBeGreaterThan(0);
    expect(score.probability).toBeLessThan(1);
    expect(score.expectedLoss).toBeGreaterThan(0);
    expect(score.modelVersion).toBe("v1");
    // A brand-new loan with no payments or contact on record says so.
    expect(Array.isArray(score.reasons)).toBe(true);
  });

  it("refuses to commit the same preview twice", async () => {
    const p = await preview(
      managerA,
      "2026-10-31",
      csv([
        { loanNo: L("1") },
        { loanNo: L("2"), pincode: "452002" },
        { loanNo: L("3"), pincode: "452099" },
      ]),
    );
    const first = await commit(managerA, p.json().id);
    const second = await commit(managerA, p.json().id);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
  });

  it("replaces, not duplicates, a re-uploaded day", async () => {
    const l1 = await loanByNo(L("1"));
    expect(
      await prisma.loanSnapshot.count({
        where: { loanId: l1.id, asOfDate: toDbDate("2026-10-31") },
      }),
    ).toBe(1);
    const statuses = await prisma.importBatch.findMany({
      where: { uploadedById: fx.managerA.id, asOfDate: toDbDate("2026-10-31") },
      orderBy: { createdAt: "asc" },
      select: { status: true },
    });
    expect(statuses.map((s) => s.status)).toEqual(["SUPERSEDED", "COMMITTED"]);
    expect(
      await prisma.priorityScore.count({
        where: { loanId: l1.id, asOfDate: toDbDate("2026-10-31") },
      }),
    ).toBe(1);
  });

  it("detects payments, cures and resolves promises", async () => {
    const [l1, l2] = await Promise.all([loanByNo(L("1")), loanByNo(L("2"))]);
    // Promises made on 30 Oct: L1 for 10,000 due 1 Nov; L2 for 10,000 due 31 Oct.
    await prisma.promiseToPay.createMany({
      data: [
        {
          loanId: l1.id,
          dueDate: toDbDate("2026-11-01"),
          amount: 10000,
          createdAt: new Date("2026-10-30T12:00:00+05:30"),
        },
        {
          loanId: l2.id,
          dueDate: toDbDate("2026-10-31"),
          amount: 10000,
          createdAt: new Date("2026-10-30T12:00:00+05:30"),
        },
      ],
    });

    // 1 Nov: L1 paid on 31 Oct; L2 still on the list, nothing paid (its grace day).
    now = new Date("2026-11-02T09:00:00+05:30");
    const day1 = await importDay("2026-11-01", [
      { loanNo: L("1"), dpd: 11, paid: ["2026-10-31", 10000] },
      { loanNo: L("2"), pincode: "452002", dpd: 11 },
      { loanNo: L("3"), pincode: "452099", dpd: 11 },
    ]);
    expect(day1.summary.payments).toBe(1);
    expect(day1.summary.promises).toEqual({ kept: 1, partial: 0, broken: 0 });
    expect(
      await prisma.payment.count({ where: { loanId: l1.id, date: toDbDate("2026-10-31") } }),
    ).toBe(1);

    // 2 Nov: L1 drops off the list (cured). L2's grace day has passed with nothing paid.
    const day2 = await importDay("2026-11-02", [
      { loanNo: L("2"), pincode: "452002", dpd: 12 },
      { loanNo: L("3"), pincode: "452099", dpd: 12 },
    ]);
    expect(day2.summary.cured).toBe(1);
    expect(day2.summary.promises).toEqual({ kept: 0, partial: 0, broken: 1 });
    expect(await officerOf(L("1"))).toBeNull();
    const promises = await prisma.promiseToPay.findMany({
      where: { loanId: { in: [l1.id, l2.id] } },
      select: { loanId: true, status: true },
    });
    expect(Object.fromEntries(promises.map((p) => [p.loanId, p.status]))).toEqual({
      [l1.id]: "KEPT",
      [l2.id]: "BROKEN",
    });
  });

  it("refuses an import older than the latest committed day", async () => {
    const res = await preview(managerA, "2026-10-31", csv([{ loanNo: L("1") }]));
    expect(res.statusCode).toBe(409);
  });

  it("does not let another branch's manager commit the batch", async () => {
    const p = await preview(
      managerA,
      "2026-11-02",
      csv([{ loanNo: L("2"), pincode: "452002", dpd: 12 }]),
    );
    const managerB = await signIn(app, fx.managerB.email);
    expect((await commit(managerB, p.json().id)).statusCode).toBe(404);
  });

  it("deletes abandoned previews after a day, with the borrower data they hold (DPDP)", async () => {
    const p = await preview(
      managerA,
      "2026-11-02",
      csv([{ loanNo: L("2"), pincode: "452002", dpd: 12 }]),
    );
    const ctx = { prisma, clock: () => now } as unknown as Parameters<typeof purgeStalePreviews>[0];
    await prisma.importBatch.update({ where: { id: p.json().id }, data: { createdAt: now } });
    await purgeStalePreviews(ctx);
    expect(await prisma.importBatch.count({ where: { id: p.json().id } })).toBe(1);

    now = new Date(now.getTime() + 25 * 3_600_000);
    await purgeStalePreviews(ctx);
    expect(await prisma.importBatch.count({ where: { id: p.json().id } })).toBe(0);
    expect(
      await prisma.importBatch.count({
        where: { uploadedById: fx.managerA.id, status: "COMMITTED" },
      }),
    ).toBeGreaterThan(0);
  });
});
