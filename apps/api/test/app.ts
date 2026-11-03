import type { PrismaClient } from "@kisht/db";
import { buildApp } from "../src/app.js";
import { TEST_ORIGIN, TEST_SECRET } from "./fixtures.js";

export function buildTestApp(prisma: PrismaClient) {
  return buildApp({ prisma, authSecret: TEST_SECRET, config: { baseURL: TEST_ORIGIN } });
}
