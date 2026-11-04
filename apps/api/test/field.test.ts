import { randomUUID } from "node:crypto";
import type { SyncResponse, TodayList } from "@kisht/contracts";
import { createTestPrisma } from "@kisht/db/testing";
import { toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDemoClock } from "../src/modules/demo/routes.js";
import { stateOf } from "../src/modules/field/today.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
const ist = (t: string) => new Date(`${t}+05:30`);
const DAY = "2026-11-04";

let app: FastifyInstance;
let fx: Fixture;
let now = ist(`${DAY}T10:00:00`);
let officer: string;
let seq = 0;

const json = { origin: TEST_ORIGIN, "content-type": "application/json" };

/** A loan held by officer A1, on today's list, with a stored score. */
async function makeLoan(opts: { dpd: number; expectedLoss: number; officerId?: string }) {
  seq++;
  const borrower = await prisma.borrower.create({
    data: {
      name: `Company F${seq}`,
      businessType: "test",
      phone: "9000012345",
      address: "-",
      pincode: "452001",
    },
  });
  const loan = await prisma.loan.create({
    data: {
      loanNo: `LN-F${seq}-${fx.tag}`.toUpperCase(),
      borrowerId: borrower.id,
      branchId: fx.branchA,
      emiAmount: 10000,
    },
  });
  await prisma.assignment.create({
    data: { loanId: loan.id, officerId: opts.officerId ?? fx.officerA1.id, source: "AUTO" },
  });
  await prisma.loanSnapshot.create({
    data: { loanId: loan.id, asOfDate: toDbDate(DAY), outstanding: 300000, dpd: opts.dpd },
  });
  await prisma.priorityScore.create({
    data: {
      loanId: loan.id,
      asOfDate: toDbDate(DAY),
      modelVersion: "v1",
      probability: 0.4,
      expectedLoss: opts.expectedLoss,
      reasons: [{ code: "NEAR_ROLL", value: 31 - opts.dpd, weight: 0.5 }],
    },
  });
  return loan.id;
}

const attempt = (loanId: string, at: string, over: object = {}) => ({
  clientId: randomUUID(),
  loanId,
  channel: "CALL" as const,
  at,
  lat: 22.7,
  lng: 75.8,
  accuracyM: 12,
  ...over,
});

const outcome = (loanId: string, attemptClientId: string, at: string, over: object = {}) => ({
  clientId: randomUUID(),
  attemptClientId,
  loanId,
  type: "NOT_REACHABLE" as const,
  at,
  amount: null,
  promiseDueDate: null,
  note: null,
  lat: null,
  lng: null,
  accuracyM: null,
  ...over,
});

async function sync(
  body: { sentAt?: string; attempts?: object[]; outcomes?: object[] },
  cookie = officer,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/sync",
    headers: { ...json, cookie },
    payload: { sentAt: now.toISOString(), attempts: [], outcomes: [], ...body },
  });
  expect(res.statusCode).toBe(200);
  return res.json<SyncResponse>();
}

async function today(cookie = officer) {
  const res = await app.inject({ method: "GET", url: "/api/officer/today", headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json<TodayList>();
}

beforeAll(async () => {
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
  });
  fx = await createFixture(prisma);
  officer = await signIn(app, fx.officerA1.email);
});

beforeEach(() => {
  now = ist(`${DAY}T10:00:00`);
});

afterAll(async () => {
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("contact window at the server (RBI 8 am to 7 pm)", () => {
  it("records an attempt inside the window", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const a = attempt(loanId, now.toISOString());
    const res = await sync({ attempts: [a] });
    expect(res.attempts[0]).toMatchObject({ status: "recorded", reason: null });
    const row = await prisma.contactAttempt.findUniqueOrThrow({ where: { clientId: a.clientId } });
    expect(row).toMatchObject({ allowed: true, lat: 22.7, accuracyM: 12 });
  });

  it("blocks an attempt at 19:00:00 but still records it", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    now = ist(`${DAY}T19:00:00`);
    const a = attempt(loanId, now.toISOString());
    const res = await sync({ attempts: [a] });
    expect(res.attempts[0]).toMatchObject({ status: "blocked", reason: "OUTSIDE_CONTACT_WINDOW" });
    const row = await prisma.contactAttempt.findUniqueOrThrow({ where: { clientId: a.clientId } });
    expect(row).toMatchObject({ allowed: false, blockReason: "OUTSIDE_CONTACT_WINDOW" });
  });

  it("accepts a call made at 18:50 and synced at 21:00", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    now = ist(`${DAY}T21:00:00`);
    const a = attempt(loanId, ist(`${DAY}T18:50:00`).toISOString());
    const o = outcome(loanId, a.clientId, ist(`${DAY}T18:55:00`).toISOString());
    const res = await sync({ attempts: [a], outcomes: [o] });
    expect(res.attempts[0]?.status).toBe("recorded");
    expect(res.outcomes[0]?.status).toBe("recorded");
  });

  it("sees through a phone clock set back to look inside the window", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    now = ist(`${DAY}T21:00:00`);
    const fake = ist(`${DAY}T15:00:00`).toISOString();
    const res = await sync({ sentAt: fake, attempts: [attempt(loanId, fake)] });
    expect(res.attempts[0]).toMatchObject({ status: "blocked", reason: "OUTSIDE_CONTACT_WINDOW" });
  });

  it("rejects an outcome on a blocked attempt, keeping the attempt on record", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    now = ist(`${DAY}T20:00:00`);
    const a = attempt(loanId, now.toISOString());
    const o = outcome(loanId, a.clientId, now.toISOString());
    const res = await sync({ attempts: [a], outcomes: [o] });
    expect(res.outcomes[0]).toMatchObject({ status: "rejected", reason: "ATTEMPT_BLOCKED" });
    expect(await prisma.outcome.count({ where: { clientId: o.clientId } })).toBe(0);
    expect(await prisma.contactAttempt.count({ where: { clientId: a.clientId } })).toBe(1);
  });

  it("caps allowed attempts at three a day per loan (A5)", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const res = await sync({
      attempts: [0, 1, 2, 3].map((m) => attempt(loanId, ist(`${DAY}T09:0${m}:00`).toISOString())),
    });
    expect(res.attempts.map((a) => a.status)).toEqual([
      "recorded",
      "recorded",
      "recorded",
      "blocked",
    ]);
    expect(res.attempts[3]?.reason).toBe("DAILY_ATTEMPT_CAP");
  });
});

describe("offline retries", () => {
  it("stores a re-sent batch exactly once", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const a = attempt(loanId, now.toISOString());
    const o = outcome(loanId, a.clientId, now.toISOString(), {
      type: "PROMISE",
      promiseDueDate: "2026-11-07",
    });
    await sync({ attempts: [a], outcomes: [o] });
    const again = await sync({ attempts: [a], outcomes: [o] });
    expect(again.attempts[0]?.status).toBe("duplicate");
    expect(again.outcomes[0]?.status).toBe("duplicate");
    expect(await prisma.outcome.count({ where: { clientId: o.clientId } })).toBe(1);
    expect(await prisma.promiseToPay.count({ where: { loanId } })).toBe(1);
  });

  it("refuses events over 30 days old", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const res = await sync({
      attempts: [attempt(loanId, ist("2026-10-01T10:00:00").toISOString())],
    });
    expect(res.attempts[0]).toMatchObject({ status: "rejected", reason: "TOO_OLD" });
  });
});

describe("access", () => {
  it("refuses events for a loan the officer never held, and stores nothing", async () => {
    const a = attempt(fx.loanA2, now.toISOString());
    const res = await sync({ attempts: [a] });
    expect(res.attempts[0]).toMatchObject({ status: "rejected", reason: "NOT_ASSIGNED" });
    expect(await prisma.contactAttempt.count({ where: { clientId: a.clientId } })).toBe(0);
  });

  it("keeps a visit made before the loan was reassigned while offline", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    await prisma.assignment.updateMany({
      where: { loanId, endedAt: null },
      data: { endedAt: now },
    });
    await prisma.assignment.create({
      data: { loanId, officerId: fx.officerA2.id, source: "MANUAL" },
    });
    const res = await sync({ attempts: [attempt(loanId, now.toISOString())] });
    expect(res.attempts[0]?.status).toBe("recorded");
  });

  it("won't link an outcome to another loan's attempt", async () => {
    const [one, two] = [
      await makeLoan({ dpd: 10, expectedLoss: 100 }),
      await makeLoan({ dpd: 10, expectedLoss: 100 }),
    ];
    const a = attempt(one, now.toISOString());
    const res = await sync({
      attempts: [a],
      outcomes: [outcome(two, a.clientId, now.toISOString())],
    });
    expect(res.outcomes[0]).toMatchObject({ status: "rejected", reason: "ATTEMPT_NOT_FOUND" });
  });

  it("is for officers only", async () => {
    const manager = await signIn(app, fx.managerA.email);
    const res = await app.inject({
      method: "GET",
      url: "/api/officer/today",
      headers: { cookie: manager },
    });
    expect(res.statusCode).toBe(403);
  });

  it("sends the full number only on the holder's list, never in loan detail", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    expect((await today()).items.find((i) => i.loanId === loanId)?.phone).toBe("9000012345");
    const detail = await app.inject({
      method: "GET",
      url: `/api/loans/${loanId}`,
      headers: { cookie: await signIn(app, fx.managerA.email) },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain("9000012345");
  });

  it("rejects a promise with no date, and a cross-site post", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const a = attempt(loanId, now.toISOString());
    const bad = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { ...json, cookie: officer },
      payload: {
        sentAt: now.toISOString(),
        attempts: [a],
        outcomes: [outcome(loanId, a.clientId, now.toISOString(), { type: "PROMISE" })],
      },
    });
    expect(bad.statusCode).toBe(400);
    const csrf = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { ...json, cookie: officer, origin: "https://evil.example" },
      payload: { sentAt: now.toISOString(), attempts: [], outcomes: [] },
    });
    expect(csrf.statusCode).toBe(403);
  });
});

describe("outcomes", () => {
  it("a new promise replaces the open one, and defaults to one EMI", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    for (const due of ["2026-11-06", "2026-11-09"]) {
      const a = attempt(loanId, now.toISOString());
      const o = outcome(loanId, a.clientId, now.toISOString(), {
        type: "PROMISE",
        promiseDueDate: due,
      });
      await sync({ attempts: [a], outcomes: [o] });
    }
    const rows = await prisma.promiseToPay.findMany({
      where: { loanId },
      orderBy: { dueDate: "asc" },
    });
    expect(rows.map((p) => p.status)).toEqual(["SUPERSEDED", "PENDING"]);
    expect(rows[1]?.amount).toBe(10000);
  });

  it("refuses a promise date in the past or over 30 days ahead", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    for (const due of ["2026-11-03", "2026-12-05"]) {
      const a = attempt(loanId, now.toISOString());
      const o = outcome(loanId, a.clientId, now.toISOString(), {
        type: "PROMISE",
        promiseDueDate: due,
      });
      const res = await sync({ attempts: [a], outcomes: [o] });
      expect(res.outcomes[0]).toMatchObject({ status: "rejected", reason: "BAD_PROMISE_DATE" });
    }
  });

  it("a dispute pauses contact until a manager reviews it (A12), and is audited", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const a = attempt(loanId, now.toISOString());
    await sync({
      attempts: [a],
      outcomes: [
        outcome(loanId, a.clientId, now.toISOString(), {
          type: "DISPUTE",
          note: "Amount disputed",
        }),
      ],
    });
    const next = await sync({ attempts: [attempt(loanId, now.toISOString())] });
    expect(next.attempts[0]).toMatchObject({ status: "blocked", reason: "CONTACT_PAUSED" });
    expect(
      await prisma.auditLog.count({ where: { action: "loan.dispute", entityId: loanId } }),
    ).toBe(1);
  });
});

describe("today's list", () => {
  it("puts loans that can still roll first, then most rupees, and states last", async () => {
    await prisma.assignment.updateMany({
      where: { officerId: fx.officerA2.id, endedAt: null },
      data: { endedAt: now },
    });
    const other = await signIn(app, fx.officerA2.email);
    const big = await makeLoan({ dpd: 8, expectedLoss: 9000, officerId: fx.officerA2.id });
    const small = await makeLoan({ dpd: 25, expectedLoss: 100, officerId: fx.officerA2.id });
    const past = await makeLoan({ dpd: 70, expectedLoss: 50000, officerId: fx.officerA2.id });
    const waiting = await makeLoan({ dpd: 12, expectedLoss: 8000, officerId: fx.officerA2.id });
    await prisma.promiseToPay.create({
      data: { loanId: waiting, dueDate: toDbDate("2026-11-06"), amount: 10000 },
    });
    const list = await today(other);
    expect(list.items.map((i) => i.loanId)).toEqual([big, small, past, waiting]);
    expect(list.items.map((i) => i.state)).toEqual(["todo", "todo", "todo", "waiting"]);
    expect(list.items[0]?.priority?.reasons[0]).toEqual({ code: "NEAR_ROLL", value: 23 });
    expect(list.asOfDate).toBe(DAY);
  });

  it("marks a loan done once an outcome is logged today", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 777777 });
    const a = attempt(loanId, now.toISOString());
    await sync({ attempts: [a], outcomes: [outcome(loanId, a.clientId, now.toISOString())] });
    const item = (await today()).items.find((i) => i.loanId === loanId);
    expect(item?.state).toBe("done");
    expect(item?.lastOutcome?.type).toBe("NOT_REACHABLE");
    // The list carries what the loan screen needs, so it works with no signal (D22).
    expect(item?.history[0]).toMatchObject({ type: "NOT_REACHABLE", officerName: "officer-a1" });
    expect(item?.openAttemptClientId).toBeNull();
  });

  it("offers today's unanswered attempt, so a call can be logged after the window closes", async () => {
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const a = attempt(loanId, ist(`${DAY}T18:50:00`).toISOString());
    now = ist(`${DAY}T18:51:00`);
    await sync({ attempts: [a] });
    now = ist(`${DAY}T19:30:00`);
    const item = (await today()).items.find((i) => i.loanId === loanId);
    expect(item?.openAttemptClientId).toBe(a.clientId);
    expect(item?.attemptsToday).toBe(1);
  });

  it("caps what's left to do at the officer's daily capacity (A3)", async () => {
    await prisma.user.update({ where: { id: fx.officerA2.id }, data: { dailyCapacity: 1 } });
    const list = await today(await signIn(app, fx.officerA2.email));
    expect(list.items.filter((i) => i.state === "todo")).toHaveLength(1);
    expect(list.beyondCapacity).toBe(2);
  });

  it("gives the phone the server's clock, so a wrong phone clock can't fool the window", async () => {
    now = ist(`${DAY}T19:30:00`);
    expect((await today()).serverTime).toBe(now.toISOString());
  });
});

describe("stateOf", () => {
  const base = { contactPaused: false, today: DAY, lastOutcomeDay: null, pendingDueDate: null };

  it("does not chase before the promised date, but does on the day", () => {
    expect(stateOf({ ...base, pendingDueDate: "2026-11-05" })).toBe("waiting");
    expect(stateOf({ ...base, pendingDueDate: DAY })).toBe("todo");
  });

  it("a pause outranks everything", () => {
    expect(stateOf({ ...base, contactPaused: true, lastOutcomeDay: DAY })).toBe("paused");
  });
});

describe("demo clock (D13)", () => {
  async function demoApp(demoMode: boolean) {
    return buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN, demoMode },
    });
  }
  const setClock = (a: FastifyInstance, cookie: string, at: string | null) =>
    a.inject({
      method: "POST",
      url: "/api/demo/clock",
      headers: { ...json, cookie },
      payload: { at },
    });

  it("does not exist outside demo mode", async () => {
    const plain = await demoApp(false);
    const cookie = await signIn(plain, fx.officerA1.email);
    expect((await setClock(plain, cookie, `${DAY}T05:30:00.000Z`)).statusCode).toBe(404);
    await plain.close();
  });

  it("moves the server's rules, not just the display, and can be undone", async () => {
    const demo = await demoApp(true);
    const cookie = await signIn(demo, fx.officerA1.email);
    const loanId = await makeLoan({ dpd: 10, expectedLoss: 100 });
    const tryCall = async () => {
      const at = new Date().toISOString();
      const res = await demo.inject({
        method: "POST",
        url: "/api/sync",
        headers: { ...json, cookie },
        payload: { sentAt: at, attempts: [attempt(loanId, at)], outcomes: [] },
      });
      return res.json<SyncResponse>().attempts[0]?.reason;
    };

    await setClock(demo, cookie, ist(`${DAY}T20:00:00`).toISOString());
    expect(await tryCall()).toBe("OUTSIDE_CONTACT_WINDOW");
    await setClock(demo, cookie, ist(`${DAY}T11:00:00`).toISOString());
    expect(await tryCall()).toBeNull();

    const back = await setClock(demo, cookie, null);
    expect(back.json().simulated).toBe(false);
    await demo.close();
  });

  it("returns to real time by itself, so one visitor can't leave it set for the next", () => {
    let real = ist(`${DAY}T20:00:00`);
    const clock = createDemoClock(() => real);
    clock.set(ist(`${DAY}T11:00:00`));
    expect(clock.simulated()).toBe(true);
    real = new Date(real.getTime() + 29 * 60_000);
    expect(clock.now()).toEqual(new Date(ist(`${DAY}T11:00:00`).getTime() + 29 * 60_000));
    real = new Date(real.getTime() + 2 * 60_000);
    expect(clock.simulated()).toBe(false);
    expect(clock.now()).toEqual(real);
  });
});
