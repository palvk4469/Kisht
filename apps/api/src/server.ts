import { getPrisma } from "@kisht/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();

const app = await buildApp({
  prisma: getPrisma(),
  authSecret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  demoMode: env.DEMO_MODE,
  logger: true,
});

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => getPrisma().$disconnect())
      .then(() => process.exit(0));
  });
}
