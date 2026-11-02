import { describe, expect, it } from "vitest";
import { isContactAllowed, istMinuteOfDay, nextAllowedAt } from "./contactWindow.js";

const ist = (t: string) => new Date(`${t}+05:30`);

describe("isContactAllowed (RBI 8 am to 7 pm)", () => {
  it.each([
    ["2026-11-02T07:59:59", false],
    ["2026-11-02T08:00:00", true],
    ["2026-11-02T13:30:00", true],
    ["2026-11-02T18:59:59", true],
    ["2026-11-02T19:00:00", false],
    ["2026-11-02T23:30:00", false],
    ["2026-11-02T00:00:00", false],
  ])("%s IST -> %s", (t, allowed) => {
    expect(isContactAllowed(ist(t))).toBe(allowed);
  });

  it("judges in IST even when the instant is written in another zone", () => {
    // 13:45 UTC is 19:15 IST: blocked, though it is mid-afternoon in UTC.
    expect(isContactAllowed(new Date("2026-11-02T13:45:00Z"))).toBe(false);
    // 02:45 UTC is 08:15 IST: allowed, though it is night in UTC.
    expect(isContactAllowed(new Date("2026-11-02T02:45:00Z"))).toBe(true);
  });

  it("keeps sub-second precision at the closing edge", () => {
    expect(isContactAllowed(ist("2026-11-02T18:59:59.999"))).toBe(true);
    expect(istMinuteOfDay(ist("2026-11-02T18:59:59.999"))).toBeLessThan(19 * 60);
  });
});

describe("nextAllowedAt", () => {
  it("returns the same instant inside the window", () => {
    const t = ist("2026-11-02T10:00:00");
    expect(nextAllowedAt(t)).toEqual(t);
  });

  it("returns 08:00 the same day before the window opens", () => {
    expect(nextAllowedAt(ist("2026-11-02T06:15:00"))).toEqual(ist("2026-11-02T08:00:00"));
  });

  it("returns 08:00 the next day after it closes, across month ends", () => {
    expect(nextAllowedAt(ist("2026-11-02T19:00:00"))).toEqual(ist("2026-11-03T08:00:00"));
    expect(nextAllowedAt(ist("2026-11-30T21:00:00"))).toEqual(ist("2026-12-01T08:00:00"));
  });
});
