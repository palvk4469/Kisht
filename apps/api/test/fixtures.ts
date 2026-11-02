import { randomUUID } from "node:crypto";
import type { PrismaClient, Role } from "@kisht/db";
import { hashPassword } from "better-auth/crypto";
import type { FastifyInstance } from "fastify";

export const TEST_PASSWORD = "Test@12345";
export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_SECRET = "test-secret-0123456789abcdef0123456789abcdef";

type Person = { id: string; email: string };

export type Fixture = {
  tag: string;
  branchA: string;
  branchB: string;
  branchACode: string;
  branchBCode: string;
  officerA1: Person;
  officerA2: Person;
  managerA: Person;
  managerB: Person;
  head: Person;
  loanA1: string;
  loanA2: string;
  loanB1: string;
  cleanup: () => Promise<void>;
};

// Two branches; officer A1 holds loan A1, officer A2 holds loan A2, loan B1 is
// in branch B. Every row is tagged so parallel or aborted runs don't collide.
export async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const tag = randomUUID().slice(0, 8);
  const password = await hashPassword(TEST_PASSWORD);

  const [branchA, branchB] = await Promise.all(
    ["A", "B"].map((b) =>
      prisma.branch.create({
        data: { code: `${b}-${tag}`.toUpperCase(), name: `Branch ${b}`, city: "Indore" },
      }),
    ),
  );
  if (!branchA || !branchB) throw new Error("branch setup failed");
  const branchIds = [branchA.id, branchB.id];

  async function person(key: string, role: Role, branchId: string | null): Promise<Person> {
    const id = `${key}-${tag}`;
    const email = `${key}-${tag}@test.local`;
    await prisma.user.create({
      data: {
        id,
        name: key,
        email,
        role,
        branchId,
        accounts: {
          create: { id: `acc-${id}`, accountId: id, providerId: "credential", password },
        },
      },
    });
    return { id, email };
  }

  const officerA1 = await person("officer-a1", "OFFICER", branchA.id);
  const officerA2 = await person("officer-a2", "OFFICER", branchA.id);
  const managerA = await person("manager-a", "BRANCH_MANAGER", branchA.id);
  const managerB = await person("manager-b", "BRANCH_MANAGER", branchB.id);
  const head = await person("head", "HEAD", null);

  async function loan(key: string, branchId: string, officerId: string | null): Promise<string> {
    const borrower = await prisma.borrower.create({
      data: {
        name: `Company ${key}`,
        businessType: "test",
        phone: "9000012345",
        address: "-",
        pincode: "452001",
      },
    });
    const created = await prisma.loan.create({
      data: {
        loanNo: `LN-${key}-${tag}`.toUpperCase(),
        borrowerId: borrower.id,
        branchId,
        emiAmount: 10000,
      },
    });
    if (officerId) {
      await prisma.assignment.create({ data: { loanId: created.id, officerId, source: "AUTO" } });
    }
    return created.id;
  }

  const loanA1 = await loan("A1", branchA.id, officerA1.id);
  const loanA2 = await loan("A2", branchA.id, officerA2.id);
  const loanB1 = await loan("B1", branchB.id, null);

  // Removes everything in the fixture's branches, including rows tests create
  // (imported loans, snapshots, payments, promises, import batches).
  async function cleanup() {
    const userIds = [officerA1, officerA2, managerA, managerB, head].map((p) => p.id);
    const loans = await prisma.loan.findMany({
      where: { branchId: { in: branchIds } },
      select: { borrowerId: true },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.loan.deleteMany({ where: { branchId: { in: branchIds } } });
    await prisma.borrower.deleteMany({ where: { id: { in: loans.map((l) => l.borrowerId) } } });
    await prisma.importBatch.deleteMany({
      where: { OR: [{ uploadedById: { in: userIds } }, { branchId: { in: branchIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  }

  return {
    tag,
    branchA: branchA.id,
    branchB: branchB.id,
    branchACode: branchA.code,
    branchBCode: branchB.code,
    officerA1,
    officerA2,
    managerA,
    managerB,
    head,
    loanA1,
    loanA2,
    loanB1,
    cleanup,
  };
}

/** Signs in through the real Better Auth route and returns a Cookie header value. */
export async function signIn(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    payload: { email, password: TEST_PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`sign-in failed (${res.statusCode}): ${res.body}`);
  const setCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}
