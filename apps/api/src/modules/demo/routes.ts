import { DemoClock, SetDemoClock } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext, Clock } from "../../context.js";

export type DemoClockControl = {
  now: Clock;
  set: (at: Date | null) => void;
  simulated: () => boolean;
};

/** A clock that can be moved, and keeps ticking from where it was set. */
export function createDemoClock(real: Clock): DemoClockControl {
  let offsetMs: number | null = null;
  return {
    now: () => (offsetMs === null ? real() : new Date(real().getTime() + offsetMs)),
    set: (at) => {
      offsetMs = at === null ? null : at.getTime() - real().getTime();
    },
    simulated: () => offsetMs !== null,
  };
}

// Registered only in demo mode (D13), so it can't exist in a real deployment.
// Any signed-in user may use it: a reviewer signed in as an officer at 10 pm
// otherwise can't try the contact flow at all.
export function registerDemo(app: FastifyInstance, ctx: AppContext, clock: DemoClockControl) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["demo"];
  const state = () => ({ simulated: clock.simulated(), now: clock.now().toISOString() });

  r.get(
    "/api/demo/clock",
    { preHandler: ctx.authenticate, schema: { tags, response: { 200: DemoClock } } },
    async () => state(),
  );

  r.post(
    "/api/demo/clock",
    {
      preHandler: ctx.authenticate,
      schema: { tags, body: SetDemoClock, response: { 200: DemoClock } },
    },
    async (request) => {
      clock.set(request.body.at === null ? null : new Date(request.body.at));
      return state();
    },
  );
}
