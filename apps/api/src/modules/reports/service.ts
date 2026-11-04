import type {
  ActivityEntry,
  ActivityFilter,
  ActivityLog,
  Dashboard,
  OfficerRow,
} from "@kisht/contracts";
import type { Prisma } from "@kisht/db";
import {
  addDays,
  CLOCK_SKEW_WARNING_MS,
  distanceMeters,
  fromDbDate,
  type IsoDay,
  isContactAllowed,
  istDayOf,
  istDayStart,
  rollRate,
  toDbDate,
  VISIT_FAR_METERS,
} from "@kisht/domain";
import type { AppContext } from "../../context.js";
import { notFound } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";
import {
  loanWhere,
  type ManagerScope,
  managerScope,
  officerWhere,
  scopeOf,
} from "../auth/scope.js";
import { recentBacktests } from "./backtest.js";

// The brief's own numbers: the roll rate today and the target, and same-day logging.
const BASELINE_ROLL_RATE = 0.22;
const TARGET_ROLL_RATE = 0.16;
const TARGET_SAME_DAY = 0.95;

const AT_RISK_FROM_DPD = 25;
const AT_RISK_TO_DPD = 30;
const AT_RISK_SHOWN = 8;
const COHORTS_IN_HEADLINE = 4;
const PROMISE_WEEKS = 8;
const ROLL_WINDOW_DAYS = 200;
const ACTIVITY_SHOWN = 60;

/** A branch filter narrows the scope; it can never widen it. */
async function narrowed(
  ctx: AppContext,
  scope: ManagerScope,
  branchId?: string,
): Promise<ManagerScope> {
  if (!branchId) return scope;
  if (scope.kind === "branches" && !scope.branchIds.includes(branchId)) throw notFound("Branch");
  const exists = await ctx.prisma.branch.count({ where: { id: branchId } });
  if (!exists) throw notFound("Branch");
  return { kind: "branches", branchIds: [branchId] };
}

function pooled(points: readonly { cohort: number; rolled: number }[]) {
  const cohort = points.reduce((n, p) => n + p.cohort, 0);
  const rolled = points.reduce((n, p) => n + p.rolled, 0);
  return { cohort, rate: cohort > 0 ? rolled / cohort : null };
}

export async function getDashboard(
  ctx: AppContext,
  user: AuthUser,
  branchId?: string,
): Promise<Dashboard> {
  const { prisma } = ctx;
  const full = managerScope(user);
  const scope = await narrowed(ctx, full, branchId);
  const loans = loanWhere(scope);
  const now = ctx.clock();
  const today = istDayOf(now);
  const since = istDayStart(addDays(today, -30));

  const branches = await prisma.branch.findMany({
    where: full.kind === "all" ? {} : { id: { in: [...full.branchIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const shown = branches.filter((b) =>
    scope.kind === "all" ? true : scope.branchIds.includes(b.id),
  );

  // Roll rate: one tested definition, per branch and pooled.
  const snapshots = await prisma.loanSnapshot.findMany({
    // A bounded window: this page shouldn't get slower every day for years.
    where: { loan: loans, asOfDate: { gte: toDbDate(addDays(today, -ROLL_WINDOW_DAYS)) } },
    select: { loanId: true, asOfDate: true, dpd: true, loan: { select: { branchId: true } } },
  });
  const observations = snapshots.map((s) => ({
    loanId: s.loanId,
    asOfDate: fromDbDate(s.asOfDate),
    dpd: s.dpd,
    branchId: s.loan.branchId,
  }));
  const days = observations.map((o) => o.asOfDate).sort();
  const first = days[0];
  const latest = days.at(-1) ?? null;
  const range = first && latest ? { from: first, to: latest } : null;

  const series = shown.map((b) => ({
    id: b.id,
    name: b.name,
    points: range
      ? rollRate(
          observations.filter((o) => o.branchId === b.id),
          range,
        ).cohorts.map((c) => ({
          day: c.day,
          rate: c.rate,
          cohort: c.cohort,
          rolled: c.rolled,
        }))
      : [],
  }));
  const overall = range ? rollRate(observations, range).cohorts : [];
  const recent = pooled(overall.slice(-COHORTS_IN_HEADLINE));
  const before = pooled(overall.slice(-2 * COHORTS_IN_HEADLINE, -COHORTS_IN_HEADLINE));

  // About to roll: on the latest list, at the edge of 30 days.
  const atRiskRows = latest
    ? await prisma.loanSnapshot.findMany({
        where: {
          asOfDate: toDbDate(latest),
          dpd: { gte: AT_RISK_FROM_DPD, lte: AT_RISK_TO_DPD },
          loan: loans,
        },
        orderBy: { outstanding: "desc" },
        select: {
          dpd: true,
          outstanding: true,
          loan: {
            select: {
              id: true,
              loanNo: true,
              borrower: { select: { name: true } },
              assignments: {
                where: { endedAt: null },
                select: { officer: { select: { name: true } } },
              },
              contactAttempts: {
                where: { allowed: true, correctedAt: { gte: istDayStart(today) } },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      })
    : [];

  // Promises by week.
  const promises = await prisma.promiseToPay.findMany({
    where: {
      loan: loans,
      status: { in: ["KEPT", "BROKEN", "PARTIAL"] },
      resolvedAt: { gte: istDayStart(addDays(today, -7 * PROMISE_WEEKS)) },
    },
    select: {
      status: true,
      resolvedAt: true,
      loan: {
        select: {
          assignments: { orderBy: { startedAt: "desc" }, take: 1, select: { officerId: true } },
        },
      },
    },
  });
  const weekly = Array.from({ length: PROMISE_WEEKS }, (_, i) => ({
    weekStart: addDays(today, -7 * (PROMISE_WEEKS - i) + 1),
    kept: 0,
    broken: 0,
  }));
  let kept30 = 0;
  let broken30 = 0;
  const promiseByOfficer = new Map<string, { kept: number; broken: number }>();
  for (const p of promises) {
    const on = p.resolvedAt as Date;
    const broken = p.status !== "KEPT";
    const week = [...weekly].reverse().find((w) => istDayOf(on) >= w.weekStart);
    if (week) {
      if (broken) week.broken++;
      else week.kept++;
    }
    if (on >= since) {
      if (broken) broken30++;
      else kept30++;
      const officerId = p.loan.assignments[0]?.officerId;
      if (officerId) {
        const row = promiseByOfficer.get(officerId) ?? { kept: 0, broken: 0 };
        if (broken) row.broken++;
        else row.kept++;
        promiseByOfficer.set(officerId, row);
      }
    }
  }

  // Field discipline, last 30 days.
  const outcomes = await prisma.outcome.findMany({
    where: { loan: loans, correctedAt: { gte: since } },
    select: { officerId: true, correctedAt: true, receivedAt: true },
  });
  const sameDayByOfficer = new Map<string, { same: number; all: number }>();
  let sameDayAll = 0;
  for (const o of outcomes) {
    const same = istDayOf(o.correctedAt) === istDayOf(o.receivedAt);
    if (same) sameDayAll++;
    const row = sameDayByOfficer.get(o.officerId) ?? { same: 0, all: 0 };
    row.all++;
    if (same) row.same++;
    sameDayByOfficer.set(o.officerId, row);
  }

  const attempts = await prisma.contactAttempt.findMany({
    where: { loan: loans, correctedAt: { gte: since } },
    select: {
      officerId: true,
      channel: true,
      allowed: true,
      lat: true,
      lng: true,
      loan: { select: { borrower: { select: { lat: true, lng: true } } } },
    },
  });
  const attemptsByOfficer = new Map<string, { attempts: number; toCheck: number }>();
  for (const a of attempts) {
    const row = attemptsByOfficer.get(a.officerId) ?? { attempts: 0, toCheck: 0 };
    row.attempts++;
    if (a.channel === "VISIT" && a.allowed && visitNeedsCheck(a.lat, a.lng, a.loan.borrower))
      row.toCheck++;
    attemptsByOfficer.set(a.officerId, row);
  }

  const officerRows = await prisma.user.findMany({
    where: officerWhere(scope),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      branch: { select: { name: true } },
      _count: { select: { assignments: { where: { endedAt: null } } } },
    },
  });
  const officers: OfficerRow[] = officerRows.map((o) => {
    const same = sameDayByOfficer.get(o.id);
    const att = attemptsByOfficer.get(o.id);
    const prom = promiseByOfficer.get(o.id);
    return {
      id: o.id,
      name: o.name,
      branchName: o.branch?.name ?? "",
      overdueLoans: o._count.assignments,
      attempts30: att?.attempts ?? 0,
      brokenPromises30: prom?.broken ?? 0,
      keptPromises30: prom?.kept ?? 0,
      sameDayRate: same ? same.same / same.all : null,
      visitsToCheck30: att?.toCheck ?? 0,
    };
  });

  return {
    asOfDate: latest,
    branches,
    targets: {
      rollRate: TARGET_ROLL_RATE,
      baselineRollRate: BASELINE_ROLL_RATE,
      sameDay: TARGET_SAME_DAY,
    },
    rollRate: { current: recent.rate, previous: before.rate, cohort: recent.cohort, series },
    atRisk: {
      count: atRiskRows.length,
      outstanding: atRiskRows.reduce((sum, r) => sum + r.outstanding, 0),
      loans: atRiskRows.slice(0, AT_RISK_SHOWN).map((r) => ({
        loanId: r.loan.id,
        loanNo: r.loan.loanNo,
        borrowerName: r.loan.borrower.name,
        officerName: r.loan.assignments[0]?.officer.name ?? null,
        dpd: r.dpd,
        outstanding: r.outstanding,
        contactedToday: r.loan.contactAttempts.length > 0,
      })),
    },
    promises: { kept30, broken30, weekly },
    sameDay: {
      rate: outcomes.length > 0 ? sameDayAll / outcomes.length : null,
      outcomes: outcomes.length,
    },
    officers,
    backtest: await recentBacktests(ctx),
  };
}

function visitNeedsCheck(
  lat: number | null,
  lng: number | null,
  borrower: { lat: number | null; lng: number | null },
): boolean {
  if (lat === null || lng === null) return true;
  if (borrower.lat === null || borrower.lng === null) return false;
  return distanceMeters({ lat, lng }, { lat: borrower.lat, lng: borrower.lng }) > VISIT_FAR_METERS;
}

export async function getActivity(
  ctx: AppContext,
  user: AuthUser,
  query: { officerId?: string | undefined; filter: ActivityFilter },
): Promise<ActivityLog> {
  const { prisma } = ctx;
  const scope = managerScope(user);
  const loans = loanWhere(scopeOf(user));
  const today: IsoDay = istDayOf(ctx.clock());
  const since = istDayStart(addDays(today, -30));

  const officers = await prisma.user.findMany({
    where: officerWhere(scope),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const window: Prisma.ContactAttemptWhereInput = { loan: loans, correctedAt: { gte: since } };
  const [attempts30, blockedWindow30, blockedPaused30, blockedCap30, allowed, skewCandidates] =
    await Promise.all([
      prisma.contactAttempt.count({ where: window }),
      prisma.contactAttempt.count({ where: { ...window, blockReason: "OUTSIDE_CONTACT_WINDOW" } }),
      prisma.contactAttempt.count({ where: { ...window, blockReason: "CONTACT_PAUSED" } }),
      prisma.contactAttempt.count({ where: { ...window, blockReason: "DAILY_ATTEMPT_CAP" } }),
      prisma.contactAttempt.findMany({
        where: { ...window, allowed: true },
        select: { correctedAt: true },
      }),
      prisma.contactAttempt.findMany({
        where: window,
        select: { deviceAt: true, correctedAt: true },
      }),
    ]);
  const isSkewed = (a: { deviceAt: Date; correctedAt: Date }) =>
    Math.abs(a.deviceAt.getTime() - a.correctedAt.getTime()) > CLOCK_SKEW_WARNING_MS;

  const rows = await prisma.contactAttempt.findMany({
    where: {
      loan: loans,
      ...(query.officerId ? { officerId: query.officerId } : {}),
      ...(query.filter === "blocked" ? { allowed: false } : {}),
      ...(query.filter === "check" ? { channel: "VISIT" as const, allowed: true } : {}),
    },
    orderBy: { correctedAt: "desc" },
    take: query.filter === "check" ? ACTIVITY_SHOWN * 10 : ACTIVITY_SHOWN,
    include: {
      officer: { select: { name: true } },
      loan: {
        select: { loanNo: true, borrower: { select: { name: true, lat: true, lng: true } } },
      },
      outcomes: { select: { type: true, note: true }, take: 1 },
    },
  });

  const entries: ActivityEntry[] = rows.map((a) => {
    const { borrower } = a.loan;
    const isVisit = a.channel === "VISIT";
    const hasFix = a.lat !== null && a.lng !== null;
    const distanceM =
      isVisit && hasFix && borrower.lat !== null && borrower.lng !== null
        ? distanceMeters(
            { lat: a.lat as number, lng: a.lng as number },
            { lat: borrower.lat, lng: borrower.lng },
          )
        : null;
    return {
      id: a.id,
      at: a.correctedAt.toISOString(),
      officerName: a.officer.name,
      loanId: a.loanId,
      loanNo: a.loan.loanNo,
      borrowerName: borrower.name,
      channel: a.channel,
      allowed: a.allowed,
      blockReason: a.blockReason,
      outcome: a.outcomes[0]?.type ?? null,
      note: a.outcomes[0]?.note ?? null,
      lat: a.lat,
      lng: a.lng,
      accuracyM: a.accuracyM,
      distanceM,
      needsCheck: isVisit && a.allowed && visitNeedsCheck(a.lat, a.lng, borrower),
      syncedLate: istDayOf(a.correctedAt) !== istDayOf(a.receivedAt),
      clockSkewed: isSkewed(a),
    };
  });

  return {
    officers,
    compliance: {
      attempts30,
      blockedWindow30,
      blockedPaused30,
      blockedCap30,
      outsideWindowAllowed30: allowed.filter((a) => !isContactAllowed(a.correctedAt)).length,
      clockSkewed30: skewCandidates.filter(isSkewed).length,
    },
    entries: (query.filter === "check" ? entries.filter((e) => e.needsCheck) : entries).slice(
      0,
      ACTIVITY_SHOWN,
    ),
  };
}
