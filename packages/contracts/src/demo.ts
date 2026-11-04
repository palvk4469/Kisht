import { z } from "zod";

// Demo mode only (D13): lets a reviewer try the contact window at any hour.

export const DemoClock = z.object({
  simulated: z.boolean(),
  now: z.iso.datetime(),
});
export type DemoClock = z.infer<typeof DemoClock>;

export const SetDemoClock = z.object({
  /** The simulated "now"; null returns to real time. */
  at: z.iso.datetime().nullable(),
});
export type SetDemoClock = z.infer<typeof SetDemoClock>;
