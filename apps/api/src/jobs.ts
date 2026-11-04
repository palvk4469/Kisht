import type { FastifyBaseLogger } from "fastify";
import type { AppContext } from "./context.js";
import { purgeStalePreviews } from "./modules/imports/service.js";
import { dispatchReminders } from "./modules/reminders/service.js";

const REMINDERS_EVERY_MS = 60_000;
const HOUSEKEEPING_EVERY_MS = 60 * 60_000;

/** Timers in the API process (D24). Returns a function that stops them. */
export function startBackgroundJobs(ctx: AppContext, log: FastifyBaseLogger): () => void {
  const logFailure = (job: string) => (err: unknown) => log.error(err, `${job} failed`);
  const timers = [
    setInterval(
      () => dispatchReminders(ctx).catch(logFailure("reminder dispatch")),
      REMINDERS_EVERY_MS,
    ),
    setInterval(
      () => purgeStalePreviews(ctx).catch(logFailure("preview purge")),
      HOUSEKEEPING_EVERY_MS,
    ),
  ];
  for (const timer of timers) timer.unref();
  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
