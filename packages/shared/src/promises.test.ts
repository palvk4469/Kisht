import { describe, expect, it } from "vitest";
import { resolvePromise } from "./promises.js";

const promise = { madeOn: "2026-11-01", dueDate: "2026-11-05", amount: 20000 };

describe("resolvePromise", () => {
  it("is pending before the due date with no payment", () => {
    expect(resolvePromise(promise, [], "2026-11-03").status).toBe("PENDING");
  });

  it("stays pending through the grace day (export lag)", () => {
    expect(resolvePromise(promise, [], "2026-11-06").status).toBe("PENDING");
  });

  it("is broken the day after the grace day with nothing paid", () => {
    expect(resolvePromise(promise, [], "2026-11-07")).toEqual({
      status: "BROKEN",
      paidAmount: 0,
      resolvedOn: "2026-11-07",
    });
  });

  it("is kept early when the full amount arrives before the due date", () => {
    const r = resolvePromise(promise, [{ date: "2026-11-02", amount: 20000 }], "2026-11-03");
    expect(r).toEqual({ status: "KEPT", paidAmount: 20000, resolvedOn: "2026-11-02" });
  });

  it("counts a payment that only shows up on the grace day", () => {
    const r = resolvePromise(promise, [{ date: "2026-11-06", amount: 20000 }], "2026-11-08");
    expect(r.status).toBe("KEPT");
  });

  it("treats 90% as kept and 89% as partial", () => {
    expect(
      resolvePromise(promise, [{ date: "2026-11-05", amount: 18000 }], "2026-11-09").status,
    ).toBe("KEPT");
    expect(resolvePromise(promise, [{ date: "2026-11-05", amount: 17800 }], "2026-11-09")).toEqual({
      status: "PARTIAL",
      paidAmount: 17800,
      resolvedOn: "2026-11-07",
    });
  });

  it("adds up instalments and dates kept by the payment that crossed the line", () => {
    const r = resolvePromise(
      promise,
      [
        { date: "2026-11-04", amount: 10000 },
        { date: "2026-11-02", amount: 5000 },
        { date: "2026-11-05", amount: 5000 },
      ],
      "2026-11-09",
    );
    expect(r).toEqual({ status: "KEPT", paidAmount: 20000, resolvedOn: "2026-11-05" });
  });

  it("ignores payments before the promise was made or after the window", () => {
    const r = resolvePromise(
      promise,
      [
        { date: "2026-10-31", amount: 20000 },
        { date: "2026-11-07", amount: 20000 },
      ],
      "2026-11-09",
    );
    expect(r.status).toBe("BROKEN");
  });

  it("ignores payments dated after today (future-dated rows in a bad export)", () => {
    const r = resolvePromise(promise, [{ date: "2026-11-05", amount: 20000 }], "2026-11-03");
    expect(r.status).toBe("PENDING");
  });
});
