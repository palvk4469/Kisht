import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The single .env lives at the repo root.
config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
