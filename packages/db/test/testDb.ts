import { config } from "dotenv";
import { createPrismaClient } from "../src/client.js";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

// Tests write and delete rows, so never let them point at a non-test database.
export function createTestPrisma() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (!new URL(url).pathname.includes("test")) {
    throw new Error(`Refusing to run tests against non-test database: ${new URL(url).pathname}`);
  }
  return createPrismaClient(url);
}
