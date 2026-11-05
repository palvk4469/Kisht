import { createTestPrisma } from "@kisht/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

const prisma = createTestPrisma();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    prisma,
    authSecret: TEST_SECRET,
    config: { baseURL: TEST_ORIGIN, docs: true, demoMode: true },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("OpenAPI docs", () => {
  it("documents every API route from the contracts, and hides Better Auth's", async () => {
    await app.ready();
    const res = await app.inject("/api/docs/json");
    expect(res.statusCode).toBe(200);
    const paths = Object.keys(res.json().paths).sort();
    expect(paths).toEqual([
      "/api/demo/clock",
      "/api/imports",
      "/api/imports/demo-sample",
      "/api/imports/{id}/commit",
      "/api/loans/{id}",
      "/api/loans/{id}/reveal-contact",
      "/api/manager/activity",
      "/api/manager/assignments",
      "/api/manager/board",
      "/api/manager/dashboard",
      "/api/manager/disputes/{id}/clear",
      "/api/manager/lists/{officerId}/move",
      "/api/manager/lists/{officerId}/unpin",
      "/api/manager/promises",
      "/api/me",
      "/api/officer/loans/{loanId}/reminder-draft",
      "/api/officer/reminder-drafts/{draftId}/send",
      "/api/officer/today",
      "/api/sync",
      "/health",
    ]);
  });

  it("are off unless configured", async () => {
    const plain = await buildApp({
      prisma,
      authSecret: TEST_SECRET,
      config: { baseURL: TEST_ORIGIN },
    });
    expect((await plain.inject("/api/docs/json")).statusCode).toBe(404);
    await plain.close();
  });
});
