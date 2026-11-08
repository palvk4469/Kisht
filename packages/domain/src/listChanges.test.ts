import { describe, expect, it } from "vitest";
import { listChanges, NO_CHANGES, type SnapshotFacts } from "./listChanges.ts";

const LATEST = "2026-11-05";
const PREVIOUS = "2026-11-04";
const snap = (asOfDate: string, over: Partial<SnapshotFacts> = {}): SnapshotFacts => ({
  asOfDate,
  lastPaymentDate: null,
  lastPaymentAmount: null,
  ...over,
});
const longHeld = { startedOn: "2026-10-01", source: "AUTO" as const };

describe("what changed since the previous list", () => {
  it("says nothing when nothing changed", () => {
    expect(
      listChanges({
        latest: snap(LATEST),
        previous: snap(PREVIOUS),
        previousListDay: PREVIOUS,
        assignment: longHeld,
      }),
    ).toEqual(NO_CHANGES);
  });

  it("marks a loan on its first day overdue, or back after a gap", () => {
    const first = listChanges({
      latest: snap(LATEST),
      previous: null,
      previousListDay: PREVIOUS,
      assignment: { startedOn: LATEST, source: "AUTO" },
    });
    expect(first).toEqual({ newOverdue: true, newToYou: null, paid: null });
    const back = listChanges({
      latest: snap(LATEST),
      previous: snap("2026-10-20"),
      previousListDay: PREVIOUS,
      assignment: longHeld,
    });
    expect(back.newOverdue).toBe(true);
  });

  it("marks a loan reassigned by the import, or moved by a manager", () => {
    const base = { latest: snap(LATEST), previous: snap(PREVIOUS), previousListDay: PREVIOUS };
    expect(
      listChanges({ ...base, assignment: { startedOn: LATEST, source: "AUTO" } }).newToYou,
    ).toBe("AUTO");
    // Moved today, while the latest list is still yesterday's (A29).
    expect(
      listChanges({ ...base, assignment: { startedOn: "2026-11-06", source: "MANUAL" } }).newToYou,
    ).toBe("MANUAL");
  });

  it("marks a payment reported since the previous list, and only a new one", () => {
    const paid = listChanges({
      latest: snap(LATEST, { lastPaymentDate: PREVIOUS, lastPaymentAmount: 6000 }),
      previous: snap(PREVIOUS, { lastPaymentDate: "2026-09-01", lastPaymentAmount: 6000 }),
      previousListDay: PREVIOUS,
      assignment: longHeld,
    });
    expect(paid.paid).toEqual({ date: PREVIOUS, amount: 6000 });
    const old = listChanges({
      latest: snap(LATEST, { lastPaymentDate: "2026-09-01", lastPaymentAmount: 6000 }),
      previous: snap(PREVIOUS, { lastPaymentDate: "2026-09-01", lastPaymentAmount: 6000 }),
      previousListDay: PREVIOUS,
      assignment: longHeld,
    });
    expect(old.paid).toBeNull();
  });

  it("says nothing on the very first list, when everything would look new", () => {
    expect(
      listChanges({
        latest: snap(LATEST),
        previous: null,
        previousListDay: null,
        assignment: null,
      }),
    ).toEqual(NO_CHANGES);
  });
});
