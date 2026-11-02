import { createTestPrisma } from "@kisht/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp } from "./app.js";

const prisma = createTestPrisma();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /health", () => {
  it("reports ok with the server time", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; serverTime: string }>();
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
  });
});
