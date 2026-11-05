import { z } from "zod";

// The API's wire format. Both apps import these schemas: the API validates
// requests and serialises responses with them (fields not listed are stripped,
// so nothing leaks by accident), and the web derives its types from them.

export const Role = z.enum(["OFFICER", "BRANCH_MANAGER", "HEAD"]);
export type Role = z.infer<typeof Role>;

export const Locale = z.enum(["hi", "en"]);
export type Locale = z.infer<typeof Locale>;

export const IdParams = z.object({ id: z.string().min(1).max(64) });

export const HealthResponse = z.object({
  status: z.literal("ok"),
  /** Clients use this to measure device clock skew (offline sync). */
  serverTime: z.iso.datetime(),
});
