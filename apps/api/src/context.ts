import type { PrismaClient } from "@kisht/db";
import type { preHandlerAsyncHookHandler } from "fastify";
import type { Auth } from "./modules/auth/auth.js";
import type { ReminderDrafter } from "./modules/reminders/drafts.js";

/** The server's notion of "now". Tests pin it; the demo clock (D13) replaces it. */
export type Clock = () => Date;

export type AppConfig = {
  /** Public web origin: auth callbacks, cookie origin and the CSRF check use it. */
  baseURL: string;
  /** Demo conveniences such as the sample export (D13). */
  demoMode: boolean;
  /** Serve OpenAPI docs at /api/docs. */
  docs: boolean;
  /** Limit password guessing per IP. */
  rateLimit: boolean;
  /** Run timers such as the reminder dispatcher. Off in tests, which call them directly. */
  backgroundJobs: boolean;
};

/** Everything a feature module needs, passed explicitly instead of imported globals. */
export type AppContext = {
  prisma: PrismaClient;
  auth: Auth;
  clock: Clock;
  config: AppConfig;
  /** preHandler that resolves the session into request.user (401 if none). */
  authenticate: preHandlerAsyncHookHandler;
  /** Rewords approved templates. Null without an API key: officers get the templates. */
  drafter: ReminderDrafter | null;
};
