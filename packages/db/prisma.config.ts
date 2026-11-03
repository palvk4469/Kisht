import { defineConfig, env } from "prisma/config";
import { loadRootEnv } from "./src/env.ts";

loadRootEnv();

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
