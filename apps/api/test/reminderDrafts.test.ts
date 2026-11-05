import type { ReminderDraft, ReminderSendResult } from "@kisht/contracts";
import { createTestPrisma } from "@kisht/db/testing";
import { REMINDER_TEMPLATES, toDbDate } from "@kisht/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { DraftInput, ReminderDrafter } from "../src/modules/reminders/drafts.js";
import { createOpenRouterDrafter } from "../src/modules/reminders/openRouterDrafter.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
const ist = (t: string) => new Date(`${t}+05:30`);
const DAY = "2026-11-05";
const json = { origin: TEST_ORIGIN, "content-type": "application/json" };
const REWORDED =
  "Hello {borrowerName}, just a note that {amount} on loan {loanNo} is overdue. Please speak to your officer to agree a date. Thank you.";

let app: FastifyInstance;
let fx: Fixture;
let officer: string;
let now = ist(`${DAY}T10:00:00`);
let seq = 0;
let calls: DraftInput[] = [];
let drafter: ReminderDrafter | null = null;

async function makeLoan(opts: { lang?: "hi" | "en"; paused?: boolean; officerId?: string } = {}) {
  seq++;
  const borrower = await prisma.borrower.create({
    data: {
      name: `Company R${seq}`,
      businessType: "test",
      phone: "9000012345",
      address: "-",
      pincode: "452001",
      preferredLang: opts.lang ?? "en",
    },
  });
  const loan = await prisma.loan.create({
    data: {
      loanNo: `LN-R${seq}-${fx.tag}`.toUpperCase(),
      borrowerId: borrower.id,
      branchId: fx.branchA,
      emiAmount: 10000,
      contactPaused: opts.paused ?? false,
    },
  });
  await prisma.assignment.create({
    data: { loanId: loan.id, officerId: opts.officerId ?? fx.officerA1.id, source: "AUTO" },
  });
  return { id: loan.id, loanNo: loan.loanNo, name: borrower.name };
}

const draftRes = (loanId: string, lang: "hi" | "en" | null = null, cookie = officer) =>
  app.inject({
    method: "POST",
    url: `/api/officer/loans/${loanId}/reminder-draft`,
    headers: { ...json, cookie },
    payload: { lang },
  });

async function draft(loanId: string, lang: "hi" | "en" | null = null) {
  const res = await draftRes(loanId, lang);
  expect(res.statusCode).toBe(200);
  return res.json<ReminderDraft>();
}

const sendRes = (draftId: string, cookie = officer) =>
  app.inject({
    method: "POST",
    url: `/api/officer/reminder-drafts/${draftId}/send`,
    headers: { origin: TEST_ORIGIN, cookie },
  });

async function send(draftId: string) {
  const res = await sendRes(draftId);
  expect(res.statusCode).toBe(200);
  return res.json<ReminderSendResult>();
}

const messagesFor = (body: string) => prisma.messageLog.count({ where: { body } });

beforeAll(async () => {
  fx = await createFixture(prisma);
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN },
    clock: () => now,
    // Read through a variable, so each test can choose how the AI behaves.
    drafter: (input) => {
      calls.push(input);
      if (!drafter) throw new Error("no drafter set");
      return drafter(input);
    },
  });
  officer = await signIn(app, fx.officerA1.email);
});

beforeEach(() => {
  now = ist(`${DAY}T10:00:00`);
  calls = [];
  drafter = async () => REWORDED;
});

afterAll(async () => {
  await prisma.messageLog.deleteMany({ where: { body: { contains: fx.tag.toUpperCase() } } });
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("drafting", () => {
  it("fills the AI's wording with the borrower's details, which the AI never saw", async () => {
    const loan = await makeLoan();
    const result = await draft(loan.id);
    expect(result.source).toBe("AI");
    expect(result.body).toContain(loan.name);
    expect(result.body).toContain(loan.loanNo);
    expect(result.body).toContain("₹10,000");

    const sentToAi = JSON.stringify(calls);
    expect(sentToAi).not.toContain(loan.name);
    expect(sentToAi).not.toContain(loan.loanNo);
    expect(sentToAi).not.toContain("9000012345");
    expect(sentToAi).not.toContain("10,000");
    expect(sentToAi).toContain("{borrowerName}");
  });

  it("sends nothing until the officer taps send", async () => {
    const result = await draft((await makeLoan()).id);
    expect(await messagesFor(result.body)).toBe(0);
  });

  it.each([
    ["a threat", async () => `${REWORDED} Or the police will come.`, "CHECK_FAILED:BLOCKED_WORD"],
    ["an invented amount", async () => `${REWORDED} Add ₹500.`, "CHECK_FAILED:INVENTED_NUMBER"],
    ["no answer", async () => null, "AI_NO_ANSWER"],
    [
      "an outage",
      async () => {
        throw Object.assign(new Error("overloaded"), { status: 529 });
      },
      "AI_ERROR:529",
    ],
  ])("falls back to the approved template on %s", async (_, behaviour, reason) => {
    drafter = behaviour;
    const loan = await makeLoan();
    const result = await draft(loan.id);
    expect(result.source).toBe("TEMPLATE");
    expect(result.body).toContain("is overdue. Please speak to your officer to agree");
    expect(result.body).not.toContain("police");
    const row = await prisma.reminderDraft.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.fallbackReason).toBe(reason);
  });

  it("uses the borrower's language unless the officer picks another", async () => {
    drafter = async () => null;
    const loan = await makeLoan({ lang: "hi" });
    expect((await draft(loan.id)).lang).toBe("hi");
    expect((await draft(loan.id)).body).toContain("नमस्ते");
    const english = await draft(loan.id, "en");
    expect(english.lang).toBe("en");
    expect(english.body).toContain("Hello");
  });

  it("calls the AI once per loan, language and day", async () => {
    const loan = await makeLoan();
    const first = await draft(loan.id);
    const second = await draft(loan.id);
    expect(second.id).toBe(first.id);
    expect(calls).toHaveLength(1);
  });

  it("picks the template from the latest promise", async () => {
    const loan = await makeLoan();
    const outcome = await prisma.outcome.create({
      data: {
        clientId: crypto.randomUUID(),
        loanId: loan.id,
        officerId: fx.officerA1.id,
        type: "PROMISE",
        deviceAt: now,
        correctedAt: now,
        receivedAt: now,
      },
    });
    await prisma.promiseToPay.create({
      data: {
        loanId: loan.id,
        outcomeId: outcome.id,
        dueDate: toDbDate(DAY),
        amount: 25000,
        createdAt: now,
      },
    });
    drafter = async () => null;
    const result = await draft(loan.id);
    expect(result.body).toContain("is due today");
    expect(result.body).toContain("₹25,000");
    expect(calls[0]?.template).toBe(REMINDER_TEMPLATES.BORROWER_DUE.en);
  });

  it("refuses a paused loan, and works when no AI is configured", async () => {
    const paused = await makeLoan({ paused: true });
    expect((await draftRes(paused.id)).statusCode).toBe(409);
    expect(calls).toHaveLength(0);

    const plain = await buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN },
      clock: () => now,
    });
    const cookie = await signIn(plain, fx.officerA1.email);
    const loan = await makeLoan();
    const res = await plain.inject({
      method: "POST",
      url: `/api/officer/loans/${loan.id}/reminder-draft`,
      headers: { ...json, cookie },
      payload: { lang: null },
    });
    expect(res.json<ReminderDraft>().source).toBe("TEMPLATE");
    await plain.close();
  });

  it("hides other officers' loans and refuses managers", async () => {
    const theirs = await makeLoan({ officerId: fx.officerA2.id });
    expect((await draftRes(theirs.id)).statusCode).toBe(404);
    const mine = await makeLoan();
    const manager = await signIn(app, fx.managerA.email);
    expect((await draftRes(mine.id, null, manager)).statusCode).toBe(403);
  });
});

describe("sending", () => {
  it("sends on the tap, records the attempt and audits it", async () => {
    const loan = await makeLoan();
    const result = await draft(loan.id);
    expect(await send(result.id)).toEqual({ status: "sent", reason: null });
    expect(await messagesFor(result.body)).toBe(1);

    const attempts = await prisma.contactAttempt.findMany({ where: { loanId: loan.id } });
    expect(attempts).toMatchObject([{ channel: "MESSAGE", allowed: true }]);
    expect(
      await prisma.auditLog.count({ where: { action: "reminder.send", entityId: loan.id } }),
    ).toBe(1);
  });

  it("sends once however many times it's tapped", async () => {
    const loan = await makeLoan();
    const result = await draft(loan.id);
    const replies = await Promise.all(Array.from({ length: 5 }, () => send(result.id)));
    expect(replies.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(await messagesFor(result.body)).toBe(1);
    expect(await prisma.contactAttempt.count({ where: { loanId: loan.id } })).toBe(1);
  });

  it("blocks and records a send after 7 pm", async () => {
    const loan = await makeLoan();
    const result = await draft(loan.id);
    now = ist(`${DAY}T19:00:00`);
    expect(await send(result.id)).toEqual({ status: "blocked", reason: "OUTSIDE_CONTACT_WINDOW" });
    expect(await messagesFor(result.body)).toBe(0);
    const attempts = await prisma.contactAttempt.findMany({ where: { loanId: loan.id } });
    expect(attempts).toMatchObject([{ channel: "MESSAGE", allowed: false }]);
  });

  it("blocks a loan that went into dispute after the draft", async () => {
    const loan = await makeLoan();
    const result = await draft(loan.id);
    await prisma.loan.update({ where: { id: loan.id }, data: { contactPaused: true } });
    expect((await send(result.id)).reason).toBe("CONTACT_PAUSED");
    expect(await messagesFor(result.body)).toBe(0);
  });

  it("counts towards the day's limit of three contacts", async () => {
    const loan = await makeLoan();
    drafter = async () => null;
    for (const expected of ["sent", "sent", "sent", "blocked"]) {
      const result = await draft(loan.id);
      expect((await send(result.id)).status).toBe(expected);
    }
  });

  it("won't send yesterday's draft", async () => {
    const result = await draft((await makeLoan()).id);
    now = ist("2026-11-06T10:00:00");
    expect((await sendRes(result.id)).statusCode).toBe(409);
    expect(await messagesFor(result.body)).toBe(0);
  });

  it("hides another officer's draft", async () => {
    const result = await draft((await makeLoan()).id);
    const other = await signIn(app, fx.officerA2.email);
    expect((await sendRes(result.id, other)).statusCode).toBe(404);
  });

  it("opens nothing to log an outcome against", async () => {
    const loan = await makeLoan();
    await prisma.loanSnapshot.create({
      data: { loanId: loan.id, asOfDate: toDbDate(DAY), outstanding: 300000, dpd: 10 },
    });
    await send((await draft(loan.id)).id);
    const res = await app.inject({
      method: "GET",
      url: "/api/officer/today",
      headers: { cookie: officer },
    });
    const item = res
      .json<{
        items: { loanId: string; openAttemptClientId: string | null; attemptsToday: number }[];
      }>()
      .items.find((i) => i.loanId === loan.id);
    expect(item).toMatchObject({ openAttemptClientId: null, attemptsToday: 1 });
  });
});

describe("the OpenRouter adapter", () => {
  const input: DraftInput = { template: "Hello {borrowerName}", lang: "hi", situation: "Overdue." };
  const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  const answer = (content: unknown, finish_reason = "stop") =>
    reply({ choices: [{ finish_reason, message: { content } }] });
  const drafterWith = (response: Response, sent: RequestInit[] = []) =>
    createOpenRouterDrafter({
      apiKey: "test-key",
      fetch: async (_url, init) => {
        sent.push(init as RequestInit);
        return response;
      },
    });

  it("sends the template and returns the trimmed reply", async () => {
    const sent: RequestInit[] = [];
    const drafted = drafterWith(answer("  Namaste {borrowerName}\n"), sent);
    expect(await drafted(input)).toBe("Namaste {borrowerName}");
    const body = JSON.parse(String(sent[0]?.body));
    expect(body.model).toBe("openrouter/free");
    expect(JSON.stringify(body.messages)).toContain("{borrowerName}");
    expect(JSON.stringify(body.messages)).toContain("Hindi");
    expect(new Headers(sent[0]?.headers).get("authorization")).toBe("Bearer test-key");
  });

  it("gives up on a cut-off reply or one with no text", async () => {
    expect(await drafterWith(answer("Half a mess", "length"))(input)).toBeNull();
    expect(await drafterWith(answer(null))(input)).toBeNull();
    expect(await drafterWith(reply({ choices: [] }))(input)).toBeNull();
  });

  it("surfaces an HTTP failure with its status, so the service can record it", async () => {
    await expect(drafterWith(reply({}, 429))(input)).rejects.toMatchObject({ status: 429 });
  });

  it("uses the model it's configured with", async () => {
    const sent: RequestInit[] = [];
    const drafted = createOpenRouterDrafter({
      apiKey: "k",
      model: "some/model",
      fetch: async (_url, init) => {
        sent.push(init as RequestInit);
        return answer("x");
      },
    });
    await drafted(input);
    expect(JSON.parse(String(sent[0]?.body)).model).toBe("some/model");
  });
});
