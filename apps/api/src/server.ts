import Anthropic from "@anthropic-ai/sdk";
import { getPrisma } from "@kisht/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createClaudeDrafter } from "./modules/reminders/claudeDrafter.js";

const env = loadEnv();

const app = await buildApp({
  prisma: getPrisma(),
  authSecret: env.BETTER_AUTH_SECRET,
  config: {
    baseURL: env.BETTER_AUTH_URL,
    demoMode: env.DEMO_MODE,
    docs: env.NODE_ENV !== "production" || env.DEMO_MODE,
    backgroundJobs: true,
    rateLimit: env.NODE_ENV === "production",
  },
  drafter: env.ANTHROPIC_API_KEY
    ? createClaudeDrafter(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.AI_DRAFT_MODEL)
    : null,
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
