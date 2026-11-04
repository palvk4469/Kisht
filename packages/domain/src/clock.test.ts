import { describe, expect, it } from "vitest";
import { correctedTime, isTooOld } from "./clock.ts";

const ist = (t: string) => new Date(`${t}+05:30`);

describe("correctedTime", () => {
  it("leaves a correct clock alone", () => {
    const t = ist("2026-11-04T18:50:00");
    expect(correctedTime(t, ist("2026-11-04T21:00:00"), ist("2026-11-04T21:00:00"))).toEqual(t);
  });

  it("sees through a phone set back to look inside the window", () => {
    // Really 21:00, but the phone says 15:00 for both the event and the send.
    const fake = ist("2026-11-04T15:00:00");
    expect(correctedTime(fake, fake, ist("2026-11-04T21:00:00"))).toEqual(
      ist("2026-11-04T21:00:00"),
    );
  });

  it("keeps an honest late sync at the time it happened", () => {
    // Logged offline at 18:50, synced at 21:00, phone runs 2 minutes fast.
    const at = correctedTime(
      ist("2026-11-04T18:52:00"),
      ist("2026-11-04T21:02:00"),
      ist("2026-11-04T21:00:00"),
    );
    expect(at).toEqual(ist("2026-11-04T18:50:00"));
  });

  it("never places an event after the server received it", () => {
    const now = ist("2026-11-04T12:00:00");
    expect(correctedTime(ist("2026-11-04T13:00:00"), ist("2026-11-04T12:00:00"), now)).toEqual(now);
  });
});

describe("isTooOld", () => {
  it("refuses events over 30 days old", () => {
    const now = ist("2026-11-30T12:00:00");
    expect(isTooOld(ist("2026-10-30T12:00:00"), now)).toBe(true);
    expect(isTooOld(ist("2026-11-01T12:00:00"), now)).toBe(false);
  });
});
