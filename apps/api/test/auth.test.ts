import { randomUUID } from "node:crypto";
import { createTestPrisma } from "@kisht/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { purgeStaleRateLimits } from "../src/modules/auth/auth.js";
import { buildTestApp } from "./app.js";
import {
  createFixture,
  type Fixture,
  signIn,
  TEST_ORIGIN,
  TEST_PASSWORD,
  TEST_SECRET,
} from "./fixtures.js";

const prisma = createTestPrisma();
let app: FastifyInstance;
let fx: Fixture;

beforeAll(async () => {
  app = await buildTestApp(prisma);
  fx = await createFixture(prisma);
});

afterAll(async () => {
  await fx.cleanup();
  await app.close();
  await prisma.$disconnect();
});

const json = { origin: TEST_ORIGIN, "content-type": "application/json" };

describe("sign-up and sign-in", () => {
  it("does not allow self-registration", async () => {
    // A well-formed address, so the rejection can only come from sign-up being disabled.
    const email = `intruder-${fx.tag}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: json,
      payload: { email, password: TEST_PASSWORD, name: "Intruder", role: "HEAD" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: json,
      payload: { email: fx.officerA1.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns the signed-in user with role and branch", async () => {
    const cookie = await signIn(app, fx.managerA.email);
    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: fx.managerA.id,
      role: "BRANCH_MANAGER",
      branchId: fx.branchA,
    });
  });

  it("requires a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("does not let a user change their own role or branch", async () => {
    const cookie = await signIn(app, fx.officerA1.email);
    const escalate = await app.inject({
      method: "POST",
      url: "/api/auth/update-user",
      headers: { ...json, cookie },
      payload: { name: "Officer A1", role: "HEAD", branchId: fx.branchB },
    });
    expect(escalate.statusCode).toBe(400);
    expect(escalate.json().code).toBe("FIELD_NOT_ALLOWED");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.officerA1.id } });
    expect(user.role).toBe("OFFICER");
    expect(user.branchId).toBe(fx.branchA);

    // Ordinary profile updates still work, so the rejection above is specific.
    const rename = await app.inject({
      method: "POST",
      url: "/api/auth/update-user",
      headers: { ...json, cookie },
      payload: { name: "Officer A1 (renamed)" },
    });
    expect(rename.statusCode).toBe(200);
  });
});

describe("loan access scope", () => {
  async function statusFor(email: string, loanId: string): Promise<number> {
    const cookie = await signIn(app, email);
    const res = await app.inject({
      method: "GET",
      url: `/api/loans/${loanId}`,
      headers: { cookie },
    });
    return res.statusCode;
  }

  it("an officer sees only loans currently assigned to them", async () => {
    expect(await statusFor(fx.officerA1.email, fx.loanA1)).toBe(200);
    expect(await statusFor(fx.officerA1.email, fx.loanA2)).toBe(404);
    expect(await statusFor(fx.officerA1.email, fx.loanB1)).toBe(404);
  });

  it("an officer loses access when the loan is reassigned", async () => {
    await prisma.assignment.updateMany({
      where: { loanId: fx.loanA1, endedAt: null },
      data: { endedAt: new Date() },
    });
    await prisma.assignment.create({
      data: { loanId: fx.loanA1, officerId: fx.officerA2.id, source: "MANUAL" },
    });

    expect(await statusFor(fx.officerA1.email, fx.loanA1)).toBe(404);
    expect(await statusFor(fx.officerA2.email, fx.loanA1)).toBe(200);
  });

  it("a branch manager sees their whole branch and nothing else", async () => {
    expect(await statusFor(fx.managerA.email, fx.loanA1)).toBe(200);
    expect(await statusFor(fx.managerA.email, fx.loanA2)).toBe(200);
    expect(await statusFor(fx.managerA.email, fx.loanB1)).toBe(404);
    expect(await statusFor(fx.managerB.email, fx.loanA1)).toBe(404);
  });

  it("the head of collections sees every branch", async () => {
    expect(await statusFor(fx.head.email, fx.loanA1)).toBe(200);
    expect(await statusFor(fx.head.email, fx.loanB1)).toBe(200);
  });

  it("rejects malformed ids with 400", async () => {
    const cookie = await signIn(app, fx.head.email);
    const res = await app.inject({
      method: "GET",
      url: `/api/loans/${"x".repeat(65)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("borrower contact (DPDP)", () => {
  it("masks the phone in loan detail", async () => {
    const cookie = await signIn(app, fx.managerA.email);
    const res = await app.inject({
      method: "GET",
      url: `/api/loans/${fx.loanA2}`,
      headers: { cookie },
    });

    expect(res.json().borrower.phoneMasked).toBe("••••••2345");
    expect(res.body).not.toContain("9000012345");
  });

  it("logs every reveal of the full number", async () => {
    const cookie = await signIn(app, fx.managerA.email);
    const res = await app.inject({
      method: "POST",
      url: `/api/loans/${fx.loanA2}/reveal-contact`,
      headers: { cookie, origin: TEST_ORIGIN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().phone).toBe("9000012345");
    const logs = await prisma.auditLog.findMany({
      where: { actorId: fx.managerA.id, action: "contact.reveal", entityId: fx.loanA2 },
    });
    expect(logs).toHaveLength(1);
  });

  it("refuses to reveal out-of-scope numbers and logs nothing", async () => {
    const cookie = await signIn(app, fx.managerB.email);
    const res = await app.inject({
      method: "POST",
      url: `/api/loans/${fx.loanA2}/reveal-contact`,
      headers: { cookie, origin: TEST_ORIGIN },
    });

    expect(res.statusCode).toBe(404);
    expect(await prisma.auditLog.count({ where: { actorId: fx.managerB.id } })).toBe(0);
  });
});

describe("cross-site request protection", () => {
  it("rejects auth mutations from another origin", async () => {
    const cookie = await signIn(app, fx.officerA2.email);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/update-user",
      headers: { "content-type": "application/json", cookie, origin: "https://evil.example" },
      payload: { name: "Pwned" },
    });

    expect(res.statusCode).toBe(403);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.officerA2.id } });
    expect(user.name).not.toBe("Pwned");
  });

  it("rejects API mutations from another origin or with no origin", async () => {
    const cookie = await signIn(app, fx.head.email);
    for (const headers of [{ cookie, origin: "https://evil.example" }, { cookie }]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/loans/${fx.loanB1}/reveal-contact`,
        headers,
      });
      expect(res.statusCode).toBe(403);
    }
    expect(await prisma.auditLog.count({ where: { actorId: fx.head.id } })).toBe(0);
  });
});

describe("password guessing", () => {
  const limitedApp = () =>
    buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN, rateLimit: true },
    });
  const guess = (app: FastifyInstance, ip: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { ...json, "x-forwarded-for": ip },
      payload: { email: fx.officerA1.email, password: "wrong-password" },
    });
  // Counts live in the database, so they outlast a run.
  beforeEach(() => prisma.rateLimit.deleteMany());

  it("is cut off per IP when the limit is on (as in production)", async () => {
    const limited = await limitedApp();
    const ip = "203.0.113.7";
    const results: number[] = [];
    for (let i = 0; i < 22; i++) results.push((await guess(limited, ip)).statusCode);
    expect(results.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(results.at(-1)).toBe(429);
    // Someone else, elsewhere, isn't affected.
    expect((await guess(limited, "203.0.113.8")).statusCode).toBe(401);
    await limited.close();
  });

  it("stays cut off after a restart and on a second instance", async () => {
    const first = await limitedApp();
    const ip = "203.0.113.7";
    for (let i = 0; i < 20; i++) await guess(first, ip);
    await first.close();
    const second = await limitedApp();
    expect((await guess(second, ip)).statusCode).toBe(429);
    await second.close();
  });

  it("counts by the address the proxy saw, so everyone doesn't share one limit", async () => {
    const limited = await limitedApp();
    const chain = (forwarded: string) => guess(limited, forwarded);
    for (let i = 0; i < 20; i++) await chain("203.0.113.7, 10.0.0.1");
    // By default only the nearest proxy's record is trusted, whoever is further left.
    expect((await chain("198.51.100.1, 10.0.0.1")).statusCode).toBe(429);
    await limited.close();

    const twoProxies = await buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN, rateLimit: true, trustedProxyHops: 2 },
    });
    await prisma.rateLimit.deleteMany();
    for (let i = 0; i < 20; i++) await guess(twoProxies, "203.0.113.7, 10.0.0.1");
    expect((await guess(twoProxies, "203.0.113.7, 10.0.0.1")).statusCode).toBe(429);
    // One person's guessing doesn't lock out someone else behind the same proxies.
    expect((await guess(twoProxies, "198.51.100.1, 10.0.0.1")).statusCode).toBe(401);
    await twoProxies.close();
  });

  it("can't be dodged by inventing addresses", async () => {
    const limited = await limitedApp();
    for (let i = 0; i < 20; i++) await guess(limited, `${i}.1.1.1, 203.0.113.7`);
    expect((await guess(limited, "99.1.1.1, 203.0.113.7")).statusCode).toBe(429);
    await limited.close();
  });

  it("uses the connection itself when there is no proxy", async () => {
    const limited = await limitedApp();
    const bare = () =>
      limited.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: json,
        payload: { email: fx.officerA1.email, password: "wrong-password" },
      });
    await bare();
    const [row] = await prisma.rateLimit.findMany();
    expect(row?.key).not.toContain("no-trusted-ip");
    await limited.close();
  });

  it("forgets addresses after a day", async () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const row = (key: string, ageMs: number) => ({
      id: randomUUID(),
      key,
      count: 1,
      lastRequest: BigInt(now.getTime() - ageMs),
    });
    await prisma.rateLimit.createMany({
      data: [row("old", 25 * 60 * 60_000), row("recent", 60_000)],
    });
    await purgeStaleRateLimits(prisma, now);
    const left = await prisma.rateLimit.findMany();
    expect(left.map((r) => r.key)).toEqual(["recent"]);
  });
});
