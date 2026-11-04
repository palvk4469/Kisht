import type { BacktestWeek } from "@kisht/contracts";
import { addDays, fromDbDate, type IsoDay, istDayOf, istDayStart, toDbDate } from "@kisht/domain";
import { type BacktestRow, backtest, CURRENT_MODEL } from "@kisht/domain/scoring";
import type { AppContext } from "../../context.js";

// The weekly back-test the brief asks for: the scores we actually gave, against
// what those loans actually did thirty days later. A finished week never
// changes, so it's computed once and kept.

const HORIZON_DAYS = 30;
const WEEKS_SHOWN = 8;
const TOP_K = 5;

/** The Monday of the week an IST day falls in. */
function mondayOf(day: IsoDay): IsoDay {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

async function computeWeek(ctx: AppContext, weekStart: IsoDay): Promise<BacktestWeek | null> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scores = await ctx.prisma.priorityScore.findMany({
    where: { modelVersion: CURRENT_MODEL.version, asOfDate: { in: days.map(toDbDate) } },
    select: {
      asOfDate: true,
      probability: true,
      expectedLoss: true,
      loan: {
        select: {
          snapshots: {
            where: {
              asOfDate: {
                in: days.flatMap((d) => [toDbDate(d), toDbDate(addDays(d, HORIZON_DAYS))]),
              },
            },
            select: { asOfDate: true, dpd: true, outstanding: true },
          },
          assignments: { select: { officerId: true, startedAt: true, endedAt: true } },
        },
      },
    },
  });

  const rows: BacktestRow[] = [];
  for (const s of scores) {
    const day = fromDbDate(s.asOfDate);
    const then = s.loan.snapshots.find((x) => fromDbDate(x.asOfDate) === day);
    if (!then) continue;
    const later = s.loan.snapshots.find(
      (x) => fromDbDate(x.asOfDate) === addDays(day, HORIZON_DAYS),
    );
    const noon = new Date(istDayStart(day).getTime() + 12 * 3_600_000);
    const held = s.loan.assignments.find(
      (a) => a.startedAt <= noon && (a.endedAt === null || a.endedAt > noon),
    );
    if (!held) continue;
    rows.push({
      day,
      officer: held.officerId,
      dpd: then.dpd,
      outstanding: then.outstanding,
      probability: s.probability,
      expectedLoss: s.expectedLoss,
      late: (later?.dpd ?? 0) > 30,
    });
  }
  if (rows.length === 0) return null;

  const m = backtest(rows, TOP_K);
  return {
    weekStart,
    rows: m.rows,
    auc: m.auc,
    aucWithin30: m.aucWithin30,
    aucWithin30DpdOnly: m.aucWithin30DpdOnly,
    coverage: m.coverage,
    calibration: m.calibration,
  };
}

/** The latest finished weeks whose thirty-day results are in. Newest last. */
export async function recentBacktests(ctx: AppContext): Promise<BacktestWeek[]> {
  const today = istDayOf(ctx.clock());
  const newest = addDays(mondayOf(addDays(today, -HORIZON_DAYS)), -7);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) =>
    addDays(newest, -7 * (WEEKS_SHOWN - 1 - i)),
  );

  const stored = await ctx.prisma.backtestRun.findMany({
    where: { modelVersion: CURRENT_MODEL.version, weekStart: { in: weeks.map(toDbDate) } },
  });
  const known = new Map(
    stored.map((r) => [fromDbDate(r.weekStart), r.metrics as unknown as BacktestWeek]),
  );

  const out: BacktestWeek[] = [];
  for (const weekStart of weeks) {
    let week = known.get(weekStart) ?? null;
    if (!week) {
      week = await computeWeek(ctx, weekStart);
      if (week) {
        await ctx.prisma.backtestRun.createMany({
          data: [
            {
              weekStart: toDbDate(weekStart),
              modelVersion: CURRENT_MODEL.version,
              metrics: week,
            },
          ],
          skipDuplicates: true,
        });
      }
    }
    if (week) out.push(week);
  }
  return out;
}
