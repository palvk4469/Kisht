import { createTestPrisma } from "@kisht/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp } from "./app.js";
import { createFixture, type Fixture, signIn, TEST_ORIGIN, TEST_PASSWORD } from "./fixtures.js";

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
