import { randomUUID } from "node:crypto";
import type { ManagerBoard, PromiseTracker, TodayList } from "@kisht/contracts";
import { createTestPrisma } from "@kisht/db/testing";
import { toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { dispatchReminders } from "../src/modules/reminders/service.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
const ist = (t: string) => new Date(`${t}+05:30`);
const DAY = "2026-11-04";

let app: FastifyInstance;
let fx: Fixture;
let now = ist(`${DAY}T10:00:00`);
let manager: string;
let officer: string;
let seq = 0;

const ctx = () =>
  ({ prisma, clock: () => now }) as unknown as Parameters<typeof dispatchReminders>[0];

const post = (url: string, payload: object, cookie = manager) =>
  app.inject({
    method: "POST",
    url,
    headers: { origin: TEST_ORIGIN, "content-type": "application/json", cookie },
    payload,
  });

async function board(cookie = manager) {
  const res = await app.inject({ method: "GET", url: "/api/manager/board", headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json<ManagerBoard>();
}

async function makeLoan(
  opts: { dpd?: number; expectedLoss?: number; officerId?: string | null; paused?: boolean } = {},
) {
  seq++;
  const borrower = await prisma.borrower.create({
    data: {
      name: `Company M${seq}`,
      businessType: "test",
      phone: "9000012345",
      address: "-",
      pincode: "452001",
    },
  });
  const loan = await prisma.loan.create({
    data: {
      loanNo: `LN-M${seq}-${fx.tag}`.toUpperCase(),
      borrowerId: borrower.id,
      branchId: fx.branchA,
      emiAmount: 10000,
      contactPaused: opts.paused ?? false,
    },
  });
  if (opts.officerId !== null) {
    await prisma.assignment.create({
      data: { loanId: loan.id, officerId: opts.officerId ?? fx.officerA1.id, source: "AUTO" },
    });
  }
  await prisma.loanSnapshot.create({
    data: { loanId: loan.id, asOfDate: toDbDate(DAY), outstanding: 300000, dpd: opts.dpd ?? 10 },
  });
  await prisma.priorityScore.create({
    data: {
      loanId: loan.id,
      asOfDate: toDbDate(DAY),
      modelVersion: "v1",
      probability: 0.4,
      expectedLoss: opts.expectedLoss ?? 100,
      reasons: [{ code: "NEAR_ROLL", value: 21, weight: 0.5 }],
    },
  });
  return loan.id;
}

async function promiseFor(loanId: string, due: string) {
  const attempt = randomUUID();
  const res = await post(
    "/api/sync",
    {
      sentAt: now.toISOString(),
      attempts: [
        {
          clientId: attempt,
          loanId,
          channel: "CALL",
          at: now.toISOString(),
          lat: null,
          lng: null,
          accuracyM: null,
        },
      ],
      outcomes: [
        {
          clientId: randomUUID(),
          attemptClientId: attempt,
          loanId,
          type: "PROMISE",
          at: now.toISOString(),
          amount: null,
          promiseDueDate: due,
          note: null,
          lat: null,
          lng: null,
          accuracyM: null,
        },
      ],
    },
    officer,
  );
  expect(res.json().outcomes[0].status).toBe("recorded");
  return prisma.promiseToPay.findFirstOrThrow({ where: { loanId, status: "PENDING" } });
}

beforeAll(async () => {
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
  });
  fx = await createFixture(prisma);
  manager = await signIn(app, fx.managerA.email);
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

describe("reminders", () => {
  it("a new promise schedules reminders for the borrower and the officer", async () => {
    const loanId = await makeLoan();
    const promise = await promiseFor(loanId, "2026-11-07");
    const rows = await prisma.reminder.findMany({
      where: { promiseId: promise.id },
      orderBy: { scheduledFor: "asc" },
    });
    expect(rows.map((r) => [r.recipient, r.status])).toEqual([
      ["BORROWER", "QUEUED"],
      ["OFFICER", "QUEUED"],
      ["BORROWER", "QUEUED"],
    ]);
    expect(rows[0]?.body).toContain("₹10,000");
  });

  it("sends what's due inside the window, once, into the message log", async () => {
    const loanId = await makeLoan();
    const promise = await promiseFor(loanId, "2026-11-07");
    now = ist("2026-11-06T10:01:00");
    const first = await dispatchReminders(ctx());
    expect(first.sent).toBeGreaterThanOrEqual(1);
    await dispatchReminders(ctx());
    const sent = await prisma.reminder.findFirstOrThrow({
      where: { promiseId: promise.id, status: "SENT_MOCK" },
    });
    expect(await prisma.messageLog.count({ where: { reminderId: sent.id } })).toBe(1);
  });

  it("holds a reminder outside 8 am to 7 pm until the window opens", async () => {
    const loanId = await makeLoan();
    const promise = await promiseFor(loanId, "2026-11-08");
    now = ist("2026-11-07T20:00:00");
    await dispatchReminders(ctx());
    const held = await prisma.reminder.findFirstOrThrow({
      where: { promiseId: promise.id, recipient: "BORROWER" },
      orderBy: { scheduledFor: "asc" },
    });
    expect(held.status).toBe("DEFERRED_WINDOW");
    expect(held.scheduledFor).toEqual(ist("2026-11-08T08:00:00"));
    expect(await prisma.messageLog.count({ where: { reminderId: held.id } })).toBe(0);
  });

  it("cancels reminders once the promise is replaced or the loan is in dispute", async () => {
    const loanId = await makeLoan();
    const old = await promiseFor(loanId, "2026-11-07");
    await promiseFor(loanId, "2026-11-09");
    const disputed = await makeLoan();
    const other = await promiseFor(disputed, "2026-11-07");
    await prisma.loan.update({ where: { id: disputed }, data: { contactPaused: true } });

    now = ist("2026-11-06T10:01:00");
    await dispatchReminders(ctx());
    for (const promiseId of [old.id, other.id]) {
      const first = await prisma.reminder.findFirstOrThrow({
        where: { promiseId },
        orderBy: { scheduledFor: "asc" },
      });
      expect(first.status).toBe("CANCELLED");
    }
  });
});

describe("the manager's board", () => {
  it("shows officers' lists in the model's order, plus the queue and disputes", async () => {
    const big = await makeLoan({ expectedLoss: 90000 });
    const queue = await makeLoan({ officerId: null });
    const dispute = await makeLoan({ paused: true });
    const b = await board();
    const a1 = b.officers.find((o) => o.id === fx.officerA1.id);
    expect(a1?.loans[0]?.loanId).toBe(big);
    expect(b.unassigned.map((l) => l.loanId)).toContain(queue);
    expect(b.disputes.map((l) => l.loanId)).toContain(dispute);
    expect(a1?.loans[0]?.topReason).toEqual({ code: "NEAR_ROLL", value: 21 });
  });

  it("is limited to the manager's branch, and closed to officers", async () => {
    const managerB = await signIn(app, fx.managerB.email);
    const b = await board(managerB);
    expect(b.officers.map((o) => o.id)).not.toContain(fx.officerA1.id);
    const res = await app.inject({
      method: "GET",
      url: "/api/manager/board",
      headers: { cookie: officer },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("reordering (advisory AI)", () => {
  const todayIds = async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/officer/today",
      headers: { cookie: officer },
    });
    return res.json<TodayList>().items;
  };

  it("pins a loan at a position with a reason: the officer sees both, and it's audited", async () => {
    const low = await makeLoan({ expectedLoss: 1 });
    const res = await post(`/api/manager/lists/${fx.officerA1.id}/move`, {
      loanId: low,
      position: 1,
      reason: "Borrower is at the shop today",
    });
    expect(res.statusCode).toBe(200);

    const items = await todayIds();
    expect(items[0]).toMatchObject({ loanId: low, managerNote: "Borrower is at the shop today" });
    expect(await prisma.auditLog.count({ where: { action: "list.move", entityId: low } })).toBe(1);

    await post(`/api/manager/lists/${fx.officerA1.id}/unpin`, { loanId: low });
    expect((await todayIds())[0]?.loanId).not.toBe(low);
  });

  it("requires a reason", async () => {
    const res = await post(`/api/manager/lists/${fx.officerA1.id}/move`, {
      loanId: fx.loanA1,
      position: 1,
      reason: " ",
    });
    expect(res.statusCode).toBe(400);
  });

  it("can't touch another branch's lists", async () => {
    const managerB = await signIn(app, fx.managerB.email);
    const low = await makeLoan();
    const res = await post(
      `/api/manager/lists/${fx.officerA1.id}/move`,
      { loanId: low, position: 1, reason: "because" },
      managerB,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("reassignment", () => {
  it("moves a loan to another officer, audited, and takes it off the first list", async () => {
    const loanId = await makeLoan();
    const res = await post("/api/manager/assignments", {
      loanId,
      officerId: fx.officerA2.id,
      reason: "Rahul on leave",
    });
    expect(res.statusCode).toBe(200);
    const current = await prisma.assignment.findMany({ where: { loanId, endedAt: null } });
    expect(current).toMatchObject([
      { officerId: fx.officerA2.id, source: "MANUAL", assignedById: fx.managerA.id },
    ]);
    const detail = await app.inject({
      method: "GET",
      url: `/api/loans/${loanId}`,
      headers: { cookie: officer },
    });
    expect(detail.statusCode).toBe(404);
    expect(
      await prisma.auditLog.count({ where: { action: "loan.reassign", entityId: loanId } }),
    ).toBe(1);
  });

  it("assigns a loan from the unassigned queue", async () => {
    const loanId = await makeLoan({ officerId: null });
    const res = await post("/api/manager/assignments", {
      loanId,
      officerId: fx.officerA1.id,
      reason: "Nearest officer",
    });
    expect(res.statusCode).toBe(200);
    expect((await board()).unassigned.map((l) => l.loanId)).not.toContain(loanId);
  });

  it("refuses an officer from another branch, and no-op moves", async () => {
    const loanId = await makeLoan();
    const head = await signIn(app, fx.head.email);
    const elsewhere = await prisma.user.create({
      data: {
        id: `off-b-${fx.tag}`,
        name: "Other",
        email: `off-b-${fx.tag}@test.local`,
        role: "OFFICER",
        branchId: fx.branchB,
      },
    });
    const wrong = await post(
      "/api/manager/assignments",
      { loanId, officerId: elsewhere.id, reason: "wrong branch" },
      head,
    );
    expect(wrong.statusCode).toBe(400);
    const same = await post("/api/manager/assignments", {
      loanId,
      officerId: fx.officerA1.id,
      reason: "same officer",
    });
    expect(same.statusCode).toBe(409);
    await prisma.user.delete({ where: { id: elsewhere.id } });
  });
});

describe("disputes (A12)", () => {
  it("clearing one needs a note, reopens contact and is audited", async () => {
    const loanId = await makeLoan({ paused: true });
    expect((await post(`/api/manager/disputes/${loanId}/clear`, { note: "" })).statusCode).toBe(
      400,
    );
    const res = await post(`/api/manager/disputes/${loanId}/clear`, {
      note: "Reviewed the ledger",
    });
    expect(res.statusCode).toBe(200);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).contactPaused).toBe(
      false,
    );
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "loan.dispute.clear", entityId: loanId },
    });
    expect(log.meta).toEqual({ note: "Reviewed the ledger" });
  });

  it("can't clear another branch's dispute, or one that doesn't exist", async () => {
    const loanId = await makeLoan({ paused: true });
    const managerB = await signIn(app, fx.managerB.email);
    expect(
      (await post(`/api/manager/disputes/${loanId}/clear`, { note: "not mine" }, managerB))
        .statusCode,
    ).toBe(404);
    expect(
      (await post(`/api/manager/disputes/${fx.loanA1}/clear`, { note: "not paused" })).statusCode,
    ).toBe(404);
  });
});

describe("promise tracker", () => {
  const tracker = async (query = "") => {
    const res = await app.inject({
      method: "GET",
      url: `/api/manager/promises${query}`,
      headers: { cookie: manager },
    });
    expect(res.statusCode).toBe(200);
    return res.json<PromiseTracker>();
  };

  it("counts and lists open promises, filters by officer, and logs reminders", async () => {
    const loanId = await makeLoan();
    await promiseFor(loanId, "2026-11-07");
    const t = await tracker();
    expect(t.summary.upcoming).toBeGreaterThan(0);
    expect(t.promises.find((p) => p.loanId === loanId)).toMatchObject({
      status: "PENDING",
      officerName: "officer-a1",
      amount: 10000,
    });

    const other = await tracker(`?officerId=${fx.officerA2.id}`);
    expect(other.promises.map((p) => p.loanId)).not.toContain(loanId);
    expect((await tracker("?status=broken")).promises.map((p) => p.loanId)).not.toContain(loanId);
    expect(t.officers.map((o) => o.id)).toContain(fx.officerA1.id);
    expect(t.reminders.some((r) => r.status === "QUEUED" && r.body.includes("₹10,000"))).toBe(true);
  });

  it("rejects an unknown filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/manager/promises?status=nope",
      headers: { cookie: manager },
    });
    expect(res.statusCode).toBe(400);
  });
});
