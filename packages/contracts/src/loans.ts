import { IsoDaySchema } from "@kisht/domain";
import { z } from "zod";
import { ContactState, HistoryEntry, Priority, PromiseSummary } from "./field.ts";

export const LoanDetail = z.object({
  id: z.string(),
  loanNo: z.string(),
  emiAmount: z.number().int(),
  contactPaused: z.boolean(),
  branch: z.object({ code: z.string(), name: z.string() }),
  borrower: z.object({
    name: z.string(),
    businessType: z.string(),
    /** Masked (DPDP); the full number only via the audited reveal. */
    phoneMasked: z.string(),
    address: z.string(),
    pincode: z.string(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
  }),
  latest: z
    .object({ asOfDate: IsoDaySchema, outstanding: z.number().int(), dpd: z.number().int() })
    .nullable(),
  officer: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** The number, for the officer holding this loan only (D19); null for everyone else. */
  phone: z.string().nullable(),
  priority: Priority.nullable(),
  promise: PromiseSummary.nullable(),
  contact: ContactState,
  /** The server's clock, so the phone can follow the window without trusting its own. */
  serverTime: z.iso.datetime(),
  attemptsToday: z.number().int(),
  /** An allowed attempt today with no outcome yet: logging links to it. */
  openAttemptClientId: z.string().nullable(),
  history: z.array(HistoryEntry),
});
export type LoanDetail = z.infer<typeof LoanDetail>;

export const RevealContactResponse = z.object({ phone: z.string() });
export type RevealContactResponse = z.infer<typeof RevealContactResponse>;
