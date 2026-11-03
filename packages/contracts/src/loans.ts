import { IsoDaySchema } from "@kisht/domain";
import { z } from "zod";

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
});
export type LoanDetail = z.infer<typeof LoanDetail>;

export const RevealContactResponse = z.object({ phone: z.string() });
export type RevealContactResponse = z.infer<typeof RevealContactResponse>;
