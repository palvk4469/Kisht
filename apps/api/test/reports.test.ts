import { randomUUID } from "node:crypto";
import type { ActivityLog, Dashboard, ManagerDay } from "@kisht/contracts";
import { createTestPrisma } from "@kisht/db/testing";
import { addDays, parseCsv, toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
const ist = (t: string) => new Date(`${t}+05:30`);
const TODAY = "2026-11-04";
const now = ist(`${TODAY}T10:00:00`);

let app: FastifyInstance;
let fx: Fixture;
let manager: string;
let seq = 0;

async function loan(branchId: string, snapshots: [string, number][], officerId?: string) {
  seq++;
  const borrower = await prisma.borrower.create({
    data: {
      name: `Company R${seq}`,
      businessType: "t",
      phone: "9000012345",
      address: "-",
      pincode: "452001",
      lat: 22.72,
      lng: 75.86,
    },
  });
  const l = await prisma.loan.create({
    data: {
      loanNo: `LN-R${seq}-${fx.tag}`.toUpperCase(),
      borrowerId: borrower.id,
      branchId,
      emiAmount: 1000,
    },
  });
  await prisma.loanSnapshot.createMany({
    data: snapshots.map(([day, dpd]) => ({
      loanId: l.id,
      asOfDate: toDbDate(day),
      outstanding: 100000,
      dpd,
    })),
  });
  if (officerId) {
    await prisma.assignment.create({
      data: { loanId: l.id, officerId, source: "AUTO", startedAt: ist("2026-01-01T08:00:00") },
    });
  }
  return l.id;
}

async function attempt(loanId: string, over: object = {}) {
  return prisma.contactAttempt.create({
    data: {
      clientId: randomUUID(),
      loanId,
      officerId: fx.officerA1.id,
      channel: "VISIT",
      deviceAt: ist(`${TODAY}T09:30:00`),
      correctedAt: ist(`${TODAY}T09:30:00`),
      receivedAt: ist(`${TODAY}T09:31:00`),
      lat: 22.72,
      lng: 75.86,
      accuracyM: 10,
      allowed: true,
      ...over,
    },
  });
}

const get = async <T>(url: string, cookie = manager) => {
  const res = await app.inject({ method: "GET", url, headers: { cookie } });
  expect(res.statusCode, url).toBe(200);
  return res.json<T>();
};

beforeAll(async () => {
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
  });
  fx = await createFixture(prisma);
  manager = await signIn(app, fx.managerA.email);
});

afterAll(async () => {
  await prisma.backtestRun.deleteMany();
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("dashboard", () => {
  it("computes the roll rate from snapshots, for the manager's branch only", async () => {
    const start = "2026-09-28";
    const later = addDays(start, 30);
    // In branch A: one of two rolled.
    await loan(fx.branchA, [
      [start, 10],
      [later, 40],
    ]);
    await loan(fx.branchA, [[start, 10]]);
    // In branch B: must not count.
    await loan(fx.branchB, [
      [start, 10],
      [later, 40],
    ]);
    // Keep the range open past the cohort's horizon.
    await loan(fx.branchA, [[TODAY, 3]]);

    const d = await get<Dashboard>("/api/manager/dashboard");
    expect(d.rollRate.current).toBe(0.5);
    expect(d.rollRate.cohort).toBe(2);
    expect(d.rollRate.series.map((s) => s.id)).toEqual([fx.branchA]);
    expect(d.targets).toMatchObject({ rollRate: 0.16, baselineRollRate: 0.22 });
    expect(d.branches.map((b) => b.id)).toEqual([fx.branchA]);
  });

  it("lists loans about to roll, largest first, and whether they've been contacted", async () => {
    const edge = await loan(fx.branchA, [[TODAY, 28]], fx.officerA1.id);
    await attempt(edge);
    await loan(fx.branchA, [[TODAY, 24]], fx.officerA1.id); // not yet at the edge
    await loan(fx.branchA, [[TODAY, 31]], fx.officerA1.id); // already rolled
    const d = await get<Dashboard>("/api/manager/dashboard");
    expect(d.atRisk.count).toBe(1);
    expect(d.atRisk.loans[0]).toMatchObject({
      loanId: edge,
      dpd: 28,
      contactedToday: true,
      officerName: "officer-a1",
    });
  });

  it("won't let a manager filter into another branch", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/manager/dashboard?branchId=${fx.branchB}`,
      headers: { cookie: manager },
    });
    expect(res.statusCode).toBe(404);
  });

  it("lets the head see all, or filter to one branch", async () => {
    const head = await signIn(app, fx.head.email);
    const all = await get<Dashboard>("/api/manager/dashboard", head);
    expect(all.rollRate.series.map((s) => s.id)).toEqual(
      expect.arrayContaining([fx.branchA, fx.branchB]),
    );
    const one = await get<Dashboard>(`/api/manager/dashboard?branchId=${fx.branchB}`, head);
    expect(one.rollRate.series.map((s) => s.id)).toEqual([fx.branchB]);
    expect(one.rollRate.current).toBe(1);
  });

  it("is closed to officers", async () => {
    const officer = await signIn(app, fx.officerA1.email);
    const res = await app.inject({
      method: "GET",
      url: "/api/manager/dashboard",
      headers: { cookie: officer },
    });
    expect(res.statusCode).toBe(403);
  });

  it("counts same-day logging", async () => {
    const id = await loan(fx.branchA, [[TODAY, 5]], fx.officerA1.id);
    const a = await attempt(id);
    const base = {
      loanId: id,
      officerId: fx.officerA1.id,
      attemptId: a.id,
      type: "NOT_REACHABLE" as const,
    };
    await prisma.outcome.createMany({
      data: [
        {
          ...base,
          clientId: randomUUID(),
          deviceAt: ist("2026-11-03T18:00:00"),
          correctedAt: ist("2026-11-03T18:00:00"),
          receivedAt: ist("2026-11-03T18:10:00"),
        },
        {
          ...base,
          clientId: randomUUID(),
          deviceAt: ist("2026-11-02T18:00:00"),
          correctedAt: ist("2026-11-02T18:00:00"),
          receivedAt: ist("2026-11-03T09:00:00"),
        },
      ],
    });
    const d = await get<Dashboard>("/api/manager/dashboard");
    expect(d.sameDay).toEqual({ rate: 0.5, outcomes: 2 });
    expect(d.officers.find((o) => o.id === fx.officerA1.id)?.sameDayRate).toBe(0.5);
  });
});

describe("weekly back-test", () => {
  it("compares stored scores with what happened thirty days later, and keeps the result", async () => {
    const day = "2026-09-21"; // A Monday, in the newest finished week whose results are in.
    const rolls = await loan(
      fx.branchA,
      [
        [day, 20],
        [addDays(day, 30), 50],
      ],
      fx.officerA1.id,
    );
    const cures = await loan(fx.branchA, [[day, 20]], fx.officerA1.id);
    await prisma.priorityScore.createMany({
      data: [
        {
          loanId: rolls,
          asOfDate: toDbDate(day),
          modelVersion: "v1",
          probability: 0.9,
          expectedLoss: 900,
          reasons: [],
        },
        {
          loanId: cures,
          asOfDate: toDbDate(day),
          modelVersion: "v1",
          probability: 0.1,
          expectedLoss: 100,
          reasons: [],
        },
      ],
    });

    const d = await get<Dashboard>("/api/manager/dashboard");
    const week = d.backtest.find((w) => w.weekStart === day);
    expect(week).toMatchObject({ rows: 2, auc: 1 });
    expect(week?.coverage.model).toBe(1);

    // A finished week is computed once: later changes to scores don't rewrite it.
    await prisma.priorityScore.updateMany({
      where: { loanId: rolls },
      data: { probability: 0.01 },
    });
    const again = await get<Dashboard>("/api/manager/dashboard");
    expect(again.backtest.find((w) => w.weekStart === day)?.auc).toBe(1);
    expect(await prisma.backtestRun.count({ where: { weekStart: toDbDate(day) } })).toBe(1);
  });
});

describe("activity and compliance", () => {
  const activity = (q = "") => get<ActivityLog>(`/api/manager/activity${q}`);

  it("flags visits with no GPS or far from the borrower; a nearby one is fine", async () => {
    const id = await loan(fx.branchA, [[TODAY, 5]], fx.officerA1.id);
    const near = await attempt(id, { lat: 22.7205 });
    const far = await attempt(id, { lat: 22.8 });
    const none = await attempt(id, { lat: null, lng: null });
    const { entries } = await activity();
    const by = (a: { id: string }) => entries.find((e) => e.id === a.id);
    expect(by(near)).toMatchObject({ needsCheck: false });
    expect(by(near)?.distanceM).toBeGreaterThan(40);
    expect(by(far)?.needsCheck).toBe(true);
    expect(by(none)).toMatchObject({ needsCheck: true, distanceM: null });

    const flagged = await activity("?filter=check");
    expect(flagged.entries.map((e) => e.id)).toEqual(expect.arrayContaining([far.id, none.id]));
    expect(flagged.entries.map((e) => e.id)).not.toContain(near.id);
  });

  it("counts blocked attempts by rule, shows a phone's wrong clock, and proves none slipped through", async () => {
    const id = await loan(fx.branchA, [[TODAY, 5]], fx.officerA1.id);
    const blocked = await attempt(id, {
      allowed: false,
      blockReason: "OUTSIDE_CONTACT_WINDOW",
      deviceAt: ist(`${TODAY}T15:00:00`),
      correctedAt: ist(`${TODAY}T07:30:00`),
    });
    const log = await activity();
    expect(log.compliance.blockedWindow30).toBeGreaterThanOrEqual(1);
    expect(log.compliance.outsideWindowAllowed30).toBe(0);
    expect(log.compliance.clockSkewed30).toBeGreaterThanOrEqual(1);
    expect(log.entries.find((e) => e.id === blocked.id)).toMatchObject({
      allowed: false,
      clockSkewed: true,
    });

    const onlyBlocked = await activity("?filter=blocked");
    expect(onlyBlocked.entries.every((e) => !e.allowed)).toBe(true);
    // A rule break would show here: an attempt marked allowed at 20:00.
    await attempt(id, {
      correctedAt: ist("2026-11-03T20:00:00"),
      deviceAt: ist("2026-11-03T20:00:00"),
    });
    expect((await activity()).compliance.outsideWindowAllowed30).toBe(1);
  });

  it("stays inside the branch, and never exposes a phone number", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/manager/activity",
      headers: { cookie: manager },
    });
    expect(res.body).not.toContain("9000012345");
    const managerB = await signIn(app, fx.managerB.email);
    const b = await get<ActivityLog>("/api/manager/activity", managerB);
    expect(b.entries).toEqual([]);
    expect(b.officers.map((o) => o.id)).not.toContain(fx.officerA1.id);
  });
});

describe("the day by officer", () => {
  it("adds up each officer's day, by IST day, with rupees and the last sync", async () => {
    const officerId = fx.officerA2.id;
    const one = await loan(fx.branchA, [[TODAY, 5]], officerId);
    const two = await loan(fx.branchA, [[TODAY, 9]], officerId);
    const a1 = await attempt(one, { officerId, channel: "CALL" });
    const a2 = await attempt(two, { officerId, channel: "CALL" });
    await attempt(two, { officerId, allowed: false, blockReason: "DAILY_ATTEMPT_CAP" });
    // Yesterday's attempt is not today's work.
    await attempt(two, {
      officerId,
      correctedAt: ist("2026-11-03T12:00:00"),
      deviceAt: ist("2026-11-03T12:00:00"),
    });
    const outcome = (
      loanId: string,
      attemptId: string,
      type: "PROMISE" | "PAID",
      amount: number,
    ) => ({
      clientId: randomUUID(),
      loanId,
      officerId,
      attemptId,
      type,
      amount,
      deviceAt: ist(`${TODAY}T09:40:00`),
      correctedAt: ist(`${TODAY}T09:40:00`),
      receivedAt: ist(`${TODAY}T09:45:00`),
    });
    await prisma.outcome.createMany({
      data: [outcome(one, a1.id, "PROMISE", 4000), outcome(two, a2.id, "PAID", 2500)],
    });

    const day = await get<ManagerDay>("/api/manager/day");
    expect(day.date).toBe(TODAY);
    expect(day.officers.find((o) => o.id === officerId)).toMatchObject({
      worked: 2,
      attempts: 2,
      blocked: 1,
      outcomes: { PAID: 1, PROMISE: 1, NOT_REACHABLE: 0, DISPUTE: 0 },
      promisedRupees: 4000,
      paidReportedRupees: 2500,
      lastSyncAt: ist(`${TODAY}T09:45:00`).toISOString(),
    });
  });

  it("shows only the manager's own officers", async () => {
    const managerB = await signIn(app, fx.managerB.email);
    const day = await get<ManagerDay>("/api/manager/day", managerB);
    expect(day.officers.map((o) => o.id)).not.toContain(fx.officerA1.id);
    expect(day.officers.map((o) => o.id)).not.toContain(fx.officerA2.id);
  });
});

describe("the contact log export", () => {
  const download = (q: string, cookie = manager) =>
    app.inject({ method: "GET", url: `/api/manager/activity/export${q}`, headers: { cookie } });

  it("has every attempt in range, blocked ones too, with no borrower details", async () => {
    const id = await loan(fx.branchA, [[TODAY, 5]], fx.officerA1.id);
    const blocked = await attempt(id, {
      allowed: false,
      blockReason: "OUTSIDE_CONTACT_WINDOW",
      correctedAt: ist(`${TODAY}T07:10:00`),
      deviceAt: ist(`${TODAY}T07:10:00`),
    });
    const allowed = await attempt(id);
    await prisma.outcome.create({
      data: {
        clientId: randomUUID(),
        loanId: id,
        officerId: fx.officerA1.id,
        attemptId: allowed.id,
        type: "NOT_REACHABLE",
        note: '=HYPERLINK("http://evil.example","open")',
        deviceAt: ist(`${TODAY}T09:35:00`),
        correctedAt: ist(`${TODAY}T09:35:00`),
      },
    });

    const res = await download(`?from=${TODAY}&to=${TODAY}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain(`contact-log-${TODAY}-to-${TODAY}.csv`);
    const rows = parseCsv(res.body);
    const header = rows[0] ?? [];
    expect(header.slice(0, 3)).toEqual(["attempt_id", "time_ist", "device_time_ist"]);
    const row = (attemptId: string) => {
      const r = rows.find((x) => x[0] === attemptId) ?? [];
      return Object.fromEntries(header.map((h, i) => [h, r[i]]));
    };
    expect(row(blocked.id)).toMatchObject({
      time_ist: `${TODAY} 07:10:00`,
      allowed: "false",
      block_reason: "OUTSIDE_CONTACT_WINDOW",
    });
    // A note typed in the field can't run as a formula in a spreadsheet.
    expect(row(allowed.id)).toMatchObject({
      outcome: "NOT_REACHABLE",
      note: `'=HYPERLINK("http://evil.example","open")`,
      officer: "officer-a1",
    });
    expect(res.body).not.toContain("9000012345");
    expect(res.body).not.toContain("Company R");

    const logged = await prisma.auditLog.findFirst({
      where: { action: "activity.export", actorId: fx.managerA.id },
      orderBy: { at: "desc" },
    });
    expect(logged?.meta).toMatchObject({ from: TODAY, to: TODAY });
  });

  it("stays inside the manager's branch", async () => {
    const managerB = await signIn(app, fx.managerB.email);
    const res = await download(`?from=${TODAY}&to=${TODAY}`, managerB);
    expect(res.statusCode).toBe(200);
    expect(parseCsv(res.body)).toHaveLength(1);
  });

  it("refuses a range longer than a quarter, or backwards", async () => {
    expect((await download("?from=2026-01-01&to=2026-11-04")).statusCode).toBe(400);
    expect((await download("?from=2026-01-01")).statusCode).toBe(400);
    expect((await download(`?from=${TODAY}&to=2026-11-01`)).statusCode).toBe(400);
  });

  it("is closed to officers", async () => {
    const officer = await signIn(app, fx.officerA1.email);
    expect((await download("", officer)).statusCode).toBe(403);
  });
});
