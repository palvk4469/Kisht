import { describe, expect, it } from "vitest";
import { rollRate } from "./rollRate.ts";

const obs = (loanId: string, asOfDate: string, dpd: number) => ({ loanId, asOfDate, dpd });

describe("rollRate", () => {
  it("counts a 1–30 loan that is 31+ thirty days later as rolled", () => {
    const r = rollRate([obs("A", "2026-10-01", 5), obs("A", "2026-10-31", 35)], {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(r).toMatchObject({ cohort: 1, rolled: 1, rate: 1 });
  });

  it("treats a loan missing from the later list as cured, not rolled", () => {
    const r = rollRate([obs("A", "2026-10-01", 5), obs("B", "2026-10-31", 3)], {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(r).toMatchObject({ cohort: 1, rolled: 0, rate: 0 });
  });

  it("only starts cohorts from the 1–30 bucket (A6 edges: 1 and 30 in, 0 and 31 out)", () => {
    const r = rollRate(
      [
        obs("in-1", "2026-10-01", 1),
        obs("in-30", "2026-10-01", 30),
        obs("out-31", "2026-10-01", 31),
        obs("in-1", "2026-10-31", 31),
        obs("in-30", "2026-10-31", 60),
        obs("out-31", "2026-10-31", 61),
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(r).toMatchObject({ cohort: 2, rolled: 2 });
  });

  it("pools weekly cohorts and skips any whose horizon is past the range", () => {
    const r = rollRate(
      [
        obs("A", "2026-10-01", 5),
        obs("A", "2026-10-31", 40),
        obs("B", "2026-10-08", 5),
        obs("C", "2026-10-08", 5),
        obs("B", "2026-11-07", 3),
      ],
      { from: "2026-10-01", to: "2026-11-07" },
    );
    expect(r.cohorts.map((c) => [c.day, c.cohort, c.rolled])).toEqual([
      ["2026-10-01", 1, 1],
      ["2026-10-08", 2, 0],
    ]);
    expect(r.rate).toBeCloseTo(1 / 3);
  });

  it("returns a null rate rather than dividing by zero", () => {
    expect(rollRate([], { from: "2026-10-01", to: "2026-11-30" }).rate).toBeNull();
  });
});
