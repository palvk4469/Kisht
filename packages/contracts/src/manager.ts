import { IsoDaySchema } from "@kisht/domain";
import { z } from "zod";
import { PromiseSummary, Reason, TodayItemState } from "./field.ts";

// What managers see and change. Every change needs a reason, and is audited.

const reason = z.string().trim().min(3, "give a reason").max(300);

export const BoardLoan = z.object({
  loanId: z.string(),
  loanNo: z.string(),
  borrowerName: z.string(),
  pincode: z.string(),
  dpd: z.number().int(),
  outstanding: z.number().int(),
  expectedLoss: z.number().int().nullable(),
  topReason: Reason.nullable(),
  state: TodayItemState,
  promise: PromiseSummary.nullable(),
  /** A manager moved this loan today; the model's rank no longer decides. */
  pin: z.object({ position: z.number().int(), reason: z.string() }).nullable(),
});
export type BoardLoan = z.infer<typeof BoardLoan>;

export const BoardOfficer = z.object({
  id: z.string(),
  name: z.string(),
  pincodes: z.array(z.string()),
  capacity: z.number().int(),
  loans: z.array(BoardLoan),
});
export type BoardOfficer = z.infer<typeof BoardOfficer>;

export const BoardDispute = BoardLoan.extend({
  officerName: z.string().nullable(),
  note: z.string().nullable(),
  raisedAt: z.iso.datetime().nullable(),
});
export type BoardDispute = z.infer<typeof BoardDispute>;

export const ManagerBoard = z.object({
  asOfDate: IsoDaySchema.nullable(),
  officers: z.array(BoardOfficer),
  /** On today's list, but no officer covers the pincode. */
  unassigned: z.array(BoardLoan),
  disputes: z.array(BoardDispute),
});
export type ManagerBoard = z.infer<typeof ManagerBoard>;

export const MoveLoanBody = z.object({
  loanId: z.string().min(1).max(64),
  position: z.number().int().min(1).max(500),
  reason,
});
export type MoveLoanBody = z.infer<typeof MoveLoanBody>;

export const ClearPinBody = z.object({ loanId: z.string().min(1).max(64) });
export type ClearPinBody = z.infer<typeof ClearPinBody>;

export const ReassignBody = z.object({
  loanId: z.string().min(1).max(64),
  officerId: z.string().min(1).max(128),
  reason,
});
export type ReassignBody = z.infer<typeof ReassignBody>;

export const ClearDisputeBody = z.object({ note: reason });
export type ClearDisputeBody = z.infer<typeof ClearDisputeBody>;

export const OfficerIdParams = z.object({ officerId: z.string().min(1).max(128) });

export const Ok = z.object({ ok: z.literal(true) });

// Promise tracker

export const PromiseFilter = z.enum(["open", "kept", "broken", "all"]);
export type PromiseFilter = z.infer<typeof PromiseFilter>;

export const PromiseQuery = z.object({
  status: PromiseFilter.default("open"),
  officerId: z.string().max(128).optional(),
});

export const TrackedPromise = z.object({
  id: z.string(),
  loanId: z.string(),
  loanNo: z.string(),
  borrowerName: z.string(),
  officerName: z.string().nullable(),
  amount: z.number().int(),
  paidAmount: z.number().int(),
  madeOn: IsoDaySchema,
  dueDate: IsoDaySchema,
  status: PromiseSummary.shape.status,
});
export type TrackedPromise = z.infer<typeof TrackedPromise>;

export const ReminderLogEntry = z.object({
  id: z.string(),
  recipient: z.enum(["BORROWER", "OFFICER"]),
  status: z.enum(["QUEUED", "SENT_MOCK", "DEFERRED_WINDOW", "CANCELLED"]),
  scheduledFor: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  body: z.string(),
  loanNo: z.string(),
});
export type ReminderLogEntry = z.infer<typeof ReminderLogEntry>;

export const PromiseTracker = z.object({
  summary: z.object({
    dueToday: z.number().int(),
    upcoming: z.number().int(),
    /** Past the date, still inside the one-day export grace (A7). */
    awaitingResult: z.number().int(),
    keptLast30: z.number().int(),
    brokenLast30: z.number().int(),
  }),
  officers: z.array(z.object({ id: z.string(), name: z.string() })),
  promises: z.array(TrackedPromise),
  reminders: z.array(ReminderLogEntry),
});
export type PromiseTracker = z.infer<typeof PromiseTracker>;
