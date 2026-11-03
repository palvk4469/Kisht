import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  fromDbDate,
  isIsoDay,
  istDayOf,
  istDayStart,
  toDbDate,
} from "./dates.ts";

describe("istDayOf", () => {
  it("uses the IST day, not the UTC day, just after IST midnight", () => {
    // 00:10 IST on 2 Nov is still 1 Nov in UTC.
    expect(istDayOf(new Date("2026-11-02T00:10:00+05:30"))).toBe("2026-11-02");
  });

  it("rolls over exactly at IST midnight", () => {
    expect(istDayOf(new Date("2026-11-01T23:59:59.999+05:30"))).toBe("2026-11-01");
    expect(istDayOf(new Date("2026-11-02T00:00:00+05:30"))).toBe("2026-11-02");
  });

  it("does not depend on the device timezone", () => {
    // Same instant written in UTC: 18:45 UTC on 1 Nov is 00:15 IST on 2 Nov.
    expect(istDayOf(new Date("2026-11-01T18:45:00Z"))).toBe("2026-11-02");
  });
});

describe("toDbDate / fromDbDate", () => {
  it("stores the intended day (regression: IST midnight used to store the day before)", () => {
    const stored = toDbDate("2026-11-02");
    expect(stored.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(fromDbDate(stored)).toBe("2026-11-02");
  });

  it("rejects malformed and impossible days", () => {
    expect(() => toDbDate("2026-11-2")).toThrow(RangeError);
    expect(() => toDbDate("2026-02-30")).toThrow(RangeError);
    expect(isIsoDay("2028-02-29")).toBe(true);
  });
});

describe("istDayStart", () => {
  it("is 18:30 UTC on the previous day", () => {
    expect(istDayStart("2026-11-02").toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });
});

describe("day arithmetic", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-05", -7)).toBe("2026-10-29");
  });

  it("counts whole days between", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-11-05", "2026-11-02")).toBe(-3);
  });
});
