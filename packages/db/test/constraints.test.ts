import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbDate } from "@kisht/shared";
import { Prisma } from "../src/index.js";
import { createTestPrisma } from "./testDb.js";

const prisma = createTestPrisma();
const tag = randomUUID().slice(0, 8);
let loanId: string;
let officerId: string;
let branchId: string;
let borrowerId: string;

beforeAll(async () => {
  const branch = await prisma.branch.create({
    data: { code: `T-${tag}`, name: "Test branch", city: "Indore" },
  });
  const officer = await prisma.user.create({
    data: { id: `u-${tag}`, name: "Test Officer", email: `officer-${tag}@test.local`, branchId: branch.id },
  });
  const borrower = await prisma.borrower.create({
    data: { name: "Company T", businessType: "test", phone: "9000000000", address: "-", pincode: "452001" },
  });
  const loan = await prisma.loan.create({
    data: { loanNo: `LN-T-${tag}`, borrowerId: borrower.id, branchId: branch.id, emiAmount: 10000 },
  });
  ({ id: branchId } = branch);
  ({ id: officerId } = officer);
  ({ id: borrowerId } = borrower);
  ({ id: loanId } = loan);
});

afterAll(async () => {
  await prisma.loan.delete({ where: { id: loanId } });
  await prisma.borrower.delete({ where: { id: borrowerId } });
  await prisma.user.delete({ where: { id: officerId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.$disconnect();
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

describe("assignment: one current officer per loan", () => {
  it("rejects a second open assignment, allows one after the first ends", async () => {
    const first = await prisma.assignment.create({ data: { loanId, officerId, source: "AUTO" } });

    await expect(
      prisma.assignment.create({ data: { loanId, officerId, source: "MANUAL" } }),
    ).rejects.toSatisfy(isUniqueViolation);

    await prisma.assignment.update({ where: { id: first.id }, data: { endedAt: new Date() } });
    await expect(
      prisma.assignment.create({ data: { loanId, officerId, source: "MANUAL" } }),
    ).resolves.toBeTruthy();
  });
});

describe("promise: one pending promise per loan", () => {
  it("rejects a second pending promise, allows one after the first is resolved", async () => {
    const first = await prisma.promiseToPay.create({
      data: { loanId, dueDate: toDbDate("2026-11-05"), amount: 20000 },
    });

    await expect(
      prisma.promiseToPay.create({ data: { loanId, dueDate: toDbDate("2026-11-07"), amount: 20000 } }),
    ).rejects.toSatisfy(isUniqueViolation);

    await prisma.promiseToPay.update({ where: { id: first.id }, data: { status: "BROKEN" } });
    await expect(
      prisma.promiseToPay.create({ data: { loanId, dueDate: toDbDate("2026-11-07"), amount: 20000 } }),
    ).resolves.toBeTruthy();
  });
});

describe("DATE columns", () => {
  it("round-trip an IST day unchanged", async () => {
    const p = await prisma.promiseToPay.findFirstOrThrow({ where: { loanId, status: "PENDING" } });
    const rows = await prisma.$queryRaw<{ d: string }[]>`
      SELECT "dueDate"::text AS d FROM promise_to_pay WHERE id = ${p.id}`;
    expect(rows[0]?.d).toBe("2026-11-07");
  });
});
