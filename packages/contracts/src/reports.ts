import { daysBetween, IsoDaySchema } from "@kisht/domain";
import { z } from "zod";
import { ContactChannel, OutcomeType } from "./field.ts";

const count = z.number().int().nonnegative();
const share = z.number().min(0).max(1);

export const DashboardQuery = z.object({ branchId: z.string().max(64).optional() });

export const RollPoint = z.object({
  day: IsoDaySchema,
  rate: share.nullable(),
  cohort: count,
  rolled: count,
});

export const BacktestWeek = z.object({
  weekStart: IsoDaySchema,
  rows: count,
  auc: z.number(),
  aucWithin30: z.number(),
  aucWithin30DpdOnly: z.number(),
  coverage: z.object({
    topK: count,
    model: share,
    oldestWithin30: share,
    oldestFirst: share,
  }),
  calibration: z.array(z.object({ predicted: share, actual: share, n: count })),
});
export type BacktestWeek = z.infer<typeof BacktestWeek>;

export const OfficerRow = z.object({
  id: z.string(),
  name: z.string(),
  branchName: z.string(),
  overdueLoans: count,
  attempts30: count,
  brokenPromises30: count,
  keptPromises30: count,
  /** Outcomes that reached the server on the day they happened (target 95%). */
  sameDayRate: share.nullable(),
  /** Visits with no GPS fix, or far from the borrower. */
  visitsToCheck30: count,
});
export type OfficerRow = z.infer<typeof OfficerRow>;

export const Dashboard = z.object({
  asOfDate: IsoDaySchema.nullable(),
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  targets: z.object({ rollRate: share, baselineRollRate: share, sameDay: share }),
  rollRate: z.object({
    /** Pooled over the latest four weekly cohorts with a known result. */
    current: share.nullable(),
    /** The four weeks before that. */
    previous: share.nullable(),
    cohort: count,
    series: z.array(z.object({ id: z.string(), name: z.string(), points: z.array(RollPoint) })),
  }),
  atRisk: z.object({
    count: count,
    outstanding: z.number().int().nonnegative(),
    loans: z.array(
      z.object({
        loanId: z.string(),
        loanNo: z.string(),
        borrowerName: z.string(),
        officerName: z.string().nullable(),
        dpd: count,
        outstanding: z.number().int().nonnegative(),
        contactedToday: z.boolean(),
      }),
    ),
  }),
  promises: z.object({
    kept30: count,
    broken30: count,
    weekly: z.array(z.object({ weekStart: IsoDaySchema, kept: count, broken: count })),
  }),
  sameDay: z.object({ rate: share.nullable(), outcomes: count }),
  officers: z.array(OfficerRow),
  /** The weekly back-test; company-wide, whatever the filter. Newest last. */
  backtest: z.array(BacktestWeek),
});
export type Dashboard = z.infer<typeof Dashboard>;

export const ActivityQuery = z.object({
  officerId: z.string().max(128).optional(),
  filter: z.enum(["all", "blocked", "check"]).default("all"),
});
export type ActivityFilter = z.infer<typeof ActivityQuery>["filter"];

/** The longest contact log one download covers; a quarter, for an audit. */
export const ACTIVITY_EXPORT_MAX_DAYS = 92;

/** IST days, inclusive. Defaults to the last 30 days. */
export const ActivityExportQuery = z
  .object({
    from: IsoDaySchema.optional(),
    to: IsoDaySchema.optional(),
    officerId: z.string().max(128).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "from must be on or before to",
    path: ["from"],
  })
  .refine((q) => !q.from || !q.to || daysBetween(q.from, q.to) < ACTIVITY_EXPORT_MAX_DAYS, {
    message: `at most ${ACTIVITY_EXPORT_MAX_DAYS} days at a time`,
    path: ["to"],
  });
export type ActivityExportQuery = z.infer<typeof ActivityExportQuery>;

export const ActivityEntry = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  officerName: z.string(),
  loanId: z.string(),
  loanNo: z.string(),
  borrowerName: z.string(),
  channel: ContactChannel,
  allowed: z.boolean(),
  blockReason: z.string().nullable(),
  outcome: OutcomeType.nullable(),
  note: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracyM: z.number().nullable(),
  /** Visits only: how far from the borrower's address the phone was. */
  distanceM: z.number().nullable(),
  /** No fix, or too far: worth a look. */
  needsCheck: z.boolean(),
  syncedLate: z.boolean(),
  /** The phone's clock was over 5 minutes out when this happened. */
  clockSkewed: z.boolean(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

export const ActivityLog = z.object({
  officers: z.array(z.object({ id: z.string(), name: z.string() })),
  compliance: z.object({
    attempts30: count,
    blockedWindow30: count,
    blockedPaused30: count,
    blockedCap30: count,
    /** Allowed attempts that were in fact outside 8 am to 7 pm. Must be zero. */
    outsideWindowAllowed30: count,
    clockSkewed30: count,
  }),
  entries: z.array(ActivityEntry),
});
export type ActivityLog = z.infer<typeof ActivityLog>;

/** One officer's day so far: what replaces the evening WhatsApp round-up. */
export const OfficerDay = z.object({
  id: z.string(),
  name: z.string(),
  branchName: z.string(),
  /** Loans assigned to them now. */
  assigned: count,
  /** Loans with an outcome logged today. */
  worked: count,
  attempts: count,
  blocked: count,
  outcomes: z.object({
    PAID: count,
    PROMISE: count,
    NOT_REACHABLE: count,
    DISPUTE: count,
  }),
  promisedRupees: count,
  paidReportedRupees: count,
  /** When their phone last sent anything today; null if it hasn't. */
  lastSyncAt: z.iso.datetime().nullable(),
});
export type OfficerDay = z.infer<typeof OfficerDay>;

export const ManagerDay = z.object({
  date: IsoDaySchema,
  officers: z.array(OfficerDay),
});
export type ManagerDay = z.infer<typeof ManagerDay>;
