import { IsoDaySchema } from "@kisht/domain";
import { z } from "zod";

// The officer's day: the prioritised list, and the events logged against it.

export const ReasonCode = z.enum([
  "NEAR_ROLL",
  "PAST_ROLL",
  "LARGE_OUTSTANDING",
  "NO_RECENT_PAYMENT",
  "OFTEN_OVERDUE",
  "BROKEN_PROMISES",
  "KEEPS_PROMISES",
  "PROMISE_OPEN",
  "NOT_CONTACTED",
  "HARD_TO_REACH",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const Reason = z.object({ code: ReasonCode, value: z.number() });
export type Reason = z.infer<typeof Reason>;

export const Priority = z.object({
  modelVersion: z.string(),
  /** P(31+ DPD in 30 days). */
  probability: z.number(),
  /** Rupees at stake; see the model card. */
  expectedLoss: z.number().int(),
  reasons: z.array(Reason),
  /** Too little history to say much: the UI says so rather than pretend. */
  limitedHistory: z.boolean(),
});
export type Priority = z.infer<typeof Priority>;

export const OutcomeType = z.enum(["PAID", "PROMISE", "NOT_REACHABLE", "DISPUTE"]);
export type OutcomeType = z.infer<typeof OutcomeType>;

export const ContactChannel = z.enum(["CALL", "VISIT"]);
export type ContactChannel = z.infer<typeof ContactChannel>;

export const PromiseSummary = z.object({
  dueDate: IsoDaySchema,
  amount: z.number().int(),
  status: z.enum(["PENDING", "KEPT", "PARTIAL", "BROKEN", "SUPERSEDED"]),
});
export type PromiseSummary = z.infer<typeof PromiseSummary>;

/** Server's view of the contact window, so the phone never trusts its own clock. */
export const ContactState = z.object({
  allowed: z.boolean(),
  nextAllowedAt: z.iso.datetime(),
});
export type ContactState = z.infer<typeof ContactState>;

export const TodayItemState = z.enum(["todo", "waiting", "done", "paused"]);
export type TodayItemState = z.infer<typeof TodayItemState>;

export const TodayItem = z.object({
  loanId: z.string(),
  loanNo: z.string(),
  borrowerName: z.string(),
  businessType: z.string(),
  /** Only ever sent to the officer holding the loan (D19); shown masked until Call. */
  phone: z.string(),
  phoneMasked: z.string(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  dpd: z.number().int(),
  outstanding: z.number().int(),
  emiAmount: z.number().int(),
  priority: Priority.nullable(),
  state: TodayItemState,
  promise: PromiseSummary.nullable(),
  lastOutcome: z.object({ type: OutcomeType, at: z.iso.datetime() }).nullable(),
});
export type TodayItem = z.infer<typeof TodayItem>;

export const TodayList = z.object({
  asOfDate: IsoDaySchema.nullable(),
  serverTime: z.iso.datetime(),
  contact: ContactState,
  capacity: z.number().int(),
  /** Loans to do beyond today's capacity, not shown. */
  beyondCapacity: z.number().int(),
  items: z.array(TodayItem),
});
export type TodayList = z.infer<typeof TodayList>;

const uuid = z.uuid();

const Gps = {
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nonnegative().nullable(),
};

export const AttemptEvent = z.object({
  clientId: uuid,
  loanId: z.string().min(1).max(64),
  channel: ContactChannel,
  /** The phone's clock when it happened. */
  at: z.iso.datetime(),
  ...Gps,
});
export type AttemptEvent = z.infer<typeof AttemptEvent>;

export const OutcomeEvent = z
  .object({
    clientId: uuid,
    /** The in-window attempt this outcome came from. */
    attemptClientId: uuid,
    loanId: z.string().min(1).max(64),
    type: OutcomeType,
    at: z.iso.datetime(),
    amount: z.number().int().positive().max(100_000_000).nullable(),
    promiseDueDate: IsoDaySchema.nullable(),
    note: z.string().trim().max(500).nullable(),
    ...Gps,
  })
  .refine((o) => o.type !== "PROMISE" || o.promiseDueDate !== null, {
    message: "a promise needs a date",
    path: ["promiseDueDate"],
  })
  .refine((o) => o.type !== "PAID" || o.amount !== null, {
    message: "a payment needs an amount",
    path: ["amount"],
  });
export type OutcomeEvent = z.infer<typeof OutcomeEvent>;

export const SyncRequest = z.object({
  /** The phone's clock when this batch was sent; corrects every event's time. */
  sentAt: z.iso.datetime(),
  attempts: z.array(AttemptEvent).max(200),
  outcomes: z.array(OutcomeEvent).max(200),
});
export type SyncRequest = z.infer<typeof SyncRequest>;

export const SyncReason = z.enum([
  "OUTSIDE_CONTACT_WINDOW",
  "CONTACT_PAUSED",
  "DAILY_ATTEMPT_CAP",
  "NOT_ASSIGNED",
  "TOO_OLD",
  "ATTEMPT_NOT_FOUND",
  "ATTEMPT_BLOCKED",
  "BAD_PROMISE_DATE",
]);
export type SyncReason = z.infer<typeof SyncReason>;

export const SyncItemResult = z.object({
  clientId: z.string(),
  /**
   * recorded: stored, and went ahead. blocked: stored as a blocked attempt.
   * duplicate: seen before (a retry). rejected: not stored.
   */
  status: z.enum(["recorded", "blocked", "duplicate", "rejected"]),
  reason: SyncReason.nullable(),
});
export type SyncItemResult = z.infer<typeof SyncItemResult>;

export const SyncResponse = z.object({
  serverTime: z.iso.datetime(),
  attempts: z.array(SyncItemResult),
  outcomes: z.array(SyncItemResult),
});
export type SyncResponse = z.infer<typeof SyncResponse>;
