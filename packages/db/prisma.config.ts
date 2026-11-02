import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The single .env lives at the repo root.
config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

// PRISMA_TARGET=test points the CLI at the test database (see migrate:test).
const urlVar = process.env.PRISMA_TARGET === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env(urlVar),
  },
});
