import type { ImportPreview } from "@kisht/contracts";
import { createTestPrisma } from "@kisht/db/testing";
import { OVERDUE_COLUMNS, parseCsv, toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

// What a bad file must not do to the book: every test uses its own branch and days.
const prisma = createTestPrisma();
const now = new Date("2026-11-20T10:00:00+05:30");

let app: FastifyInstance;
let fx: Fixture;
let manager: string;
let seq = 0;

const loanNos = (n: number) =>
  Array.from({ length: n }, () => `LN-G${++seq}-${fx.tag}`.toUpperCase());

function csv(rows: { loanNo: string; dpd?: string }[]): string {
  const lines = rows.map((r) =>
    [
      r.loanNo,
      `Company ${r.loanNo}`,
      "kirana wholesaler",
      "9000012345",
      '"Plot 1, Siyaganj, Indore"',
      "452001",
      300000,
      r.dpd ?? 10,
      10000,
      "2026-09-15",
      10000,
      fx.branchACode,
    ].join(","),
  );
  return [OVERDUE_COLUMNS.join(","), ...lines].join("\n");
}

async function preview(asOfDate: string, body: string): Promise<ImportPreview> {
  const res = await app.inject({
    method: "POST",
    url: "/api/imports",
    headers: { cookie: manager, origin: TEST_ORIGIN, "content-type": "application/json" },
    payload: { asOfDate, fileName: "overdue.csv", csv: body },
  });
  expect(res.statusCode).toBe(201);
  return res.json<ImportPreview>();
}

const commit = (id: string, payload?: object) =>
  app.inject({
    method: "POST",
    url: `/api/imports/${id}/commit`,
    headers: {
      cookie: manager,
      origin: TEST_ORIGIN,
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { payload } : {}),
  });

async function importDay(asOfDate: string, rows: { loanNo: string; dpd?: string }[]) {
  const p = await preview(asOfDate, csv(rows));
  const c = await commit(p.id);
  expect(c.statusCode).toBe(200);
  return p;
}

const openAssignments = (loanNo: string) =>
  prisma.assignment.count({ where: { loan: { loanNo }, endedAt: null } });

beforeAll(async () => {
  fx = await createFixture(prisma);
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
  });
  await prisma.officerPincode.create({ data: { officerId: fx.officerA1.id, pincode: "452001" } });
  manager = await signIn(app, fx.managerA.email);
});

afterAll(async () => {
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("a row the file got wrong", () => {
  it("doesn't cure its loan or settle its promise", async () => {
    const [good, bad] = loanNos(2) as [string, string];
    await importDay("2026-11-01", [{ loanNo: good }, { loanNo: bad }]);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { loanNo: bad } });
    await prisma.promiseToPay.create({
      data: {
        loanId: loan.id,
        dueDate: toDbDate("2026-11-01"),
        amount: 10000,
        createdAt: new Date("2026-10-30T12:00:00+05:30"),
      },
    });

    const p = await preview(
      "2026-11-02",
      csv([{ loanNo: good }, { loanNo: bad, dpd: "not-a-number" }]),
    );
    expect(p.summary.errors).toBe(1);
    expect(p.summary.cured).toBe(0);

    const c = await commit(p.id);
    expect(c.statusCode).toBe(200);
    expect(await openAssignments(bad)).toBe(1);
    const promise = await prisma.promiseToPay.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(promise.status).toBe("PENDING");
  });
});

describe("a file missing many loans", () => {
  it("flags the preview and can't commit until someone confirms", async () => {
    const all = loanNos(10);
    await importDay(
      "2026-11-03",
      all.map((loanNo) => ({ loanNo })),
    );

    const kept = all.slice(0, 4);
    const p = await preview("2026-11-04", csv(kept.map((loanNo) => ({ loanNo }))));
    expect(p.summary).toMatchObject({ cured: 6, previousList: 10, curedNeedsConfirmation: true });

    for (const attempt of [undefined, { confirmCured: false }]) {
      const refused = await commit(p.id, attempt);
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toContain("6 of 10");
    }
    // Refused means nothing happened: no loan cured, and the preview can still commit.
    expect(await openAssignments(all[9] as string)).toBe(1);

    const done = await commit(p.id, { confirmCured: true });
    expect(done.statusCode).toBe(200);
    expect(await openAssignments(all[9] as string)).toBe(0);
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "import.commit", entityId: p.id },
    });
    expect(entry.meta).toMatchObject({ cured: 6, curedConfirmed: true });
  });

  it("asks nothing on an ordinary day", async () => {
    const all = loanNos(10);
    await importDay(
      "2026-11-05",
      all.map((loanNo) => ({ loanNo })),
    );
    const next = all.slice(0, 9).map((loanNo) => ({ loanNo }));
    const p = await preview("2026-11-06", csv(next));
    expect(p.summary.curedNeedsConfirmation).toBe(false);
    expect((await commit(p.id)).statusCode).toBe(200);
  });
});

describe("the demo sample", () => {
  it("is today's export, with every loan a day further behind for each day since", async () => {
    const demo = await buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN, demoMode: true },
      clock: () => now,
    });
    try {
      const all = loanNos(8);
      // A fresh set of loans: everything earlier counts as cured, which needs a confirmation.
      const p = await preview("2026-11-17", csv(all.map((loanNo) => ({ loanNo }))));
      expect((await commit(p.id, { confirmCured: true })).statusCode).toBe(200);
      const res = await demo.inject({
        method: "GET",
        url: "/api/imports/demo-sample",
        headers: { cookie: await signIn(demo, fx.managerA.email) },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-disposition"]).toContain("overdue-2026-11-20.csv");
      const dpd = OVERDUE_COLUMNS.indexOf("dpd");
      const rows = parseCsv(res.body).slice(1);
      const listed = rows.filter((r) => all.includes(r[0] as string));
      expect(listed.length).toBeGreaterThan(0);
      // Seeded at 10 days overdue on the 17th; three days later, 13.
      for (const r of listed) expect(r[dpd]).toBe("13");
    } finally {
      await demo.close();
    }
  });
});
