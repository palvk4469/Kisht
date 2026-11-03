import { z } from "zod";
import { Locale, Role } from "./common.ts";

export const Me = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
  branchId: z.string().nullable(),
  locale: Locale,
});
export type Me = z.infer<typeof Me>;
