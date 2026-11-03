import { addDays, isContactAllowed } from "@kisht/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { type Simulation, simulate } from "../src/seed/simulate.js";

const TODAY = "2026-11-02";
let sim: Simulation;

beforeAll(() => {
  sim = simulate(TODAY);
});

function todayDpd(loanNo: string): number | undefined {
  const loan = sim.loans.find((l) => l.loanNo === loanNo);
  return sim.snapshots.find((s) => s.loanId === loan?.id && s.asOfDate === TODAY)?.dpd;
}

describe("seed simulation", () => {
  it("is deterministic", () => {
    const again = simulate(TODAY);
    expect(again.snapshots.length).toBe(sim.snapshots.length);
    expect(again.outcomes.slice(0, 50)).toEqual(sim.outcomes.slice(0, 50));
    expect(again.promises.map((p) => p.status)).toEqual(sim.promises.map((p) => p.status));
  });

  it("reproduces the brief's sample loans exactly", () => {
    expect(todayDpd("LN-10293")).toBe(12);
    expect(todayDpd("LN-10871")).toBe(27);
    expect(todayDpd("LN-11930")).toBe(19);

    const promisesOf = (loanNo: string) => {
      const id = sim.loans.find((l) => l.loanNo === loanNo)?.id;
      return sim.promises.filter((p) => p.loanId === id);
    };
    expect(promisesOf("LN-10293").map((p) => [p.dueDate, p.status])).toEqual([
      [addDays(TODAY, 3), "PENDING"],
    ]);
    expect(promisesOf("LN-11930").map((p) => [p.dueDate, p.status])).toEqual([
      [addDays(TODAY, -2), "BROKEN"],
    ]);
    expect(promisesOf("LN-10871")).toEqual([]);
  });

  it("matches the brief's roll rate (about 22%)", () => {
    const dpdOn = new Map<string, number>();
    for (const s of sim.snapshots) dpdOn.set(`${s.loanId}|${s.asOfDate}`, s.dpd);
    let cohort = 0;
    let rolled = 0;
    for (let d = sim.historyStart; addDays(d, 30) <= TODAY; d = addDays(d, 7)) {
      for (const s of sim.snapshots) {
        if (s.asOfDate !== d || s.dpd < 1 || s.dpd > 30) continue;
        cohort++;
        if ((dpdOn.get(`${s.loanId}|${addDays(d, 30)}`) ?? 0) >= 31) rolled++;
      }
    }
    expect(rolled / cohort).toBeGreaterThan(0.17);
    expect(rolled / cohort).toBeLessThan(0.28);
  });

  it("keeps the invariants the database enforces", () => {
    const pending = sim.promises.filter((p) => p.status === "PENDING").map((p) => p.loanId);
    expect(new Set(pending).size).toBe(pending.length);

    const open = sim.assignments.filter((a) => a.endedAt === null).map((a) => a.loanId);
    expect(new Set(open).size).toBe(open.length);
  });

  it("flags exactly the attempts outside 8 am to 7 pm, and records no outcome for them", () => {
    for (const a of sim.attempts) expect(a.allowed).toBe(isContactAllowed(a.at));
    const blocked = new Set(sim.attempts.filter((a) => !a.allowed).map((a) => a.id));
    expect(blocked.size).toBeGreaterThan(0);
    expect(sim.outcomes.some((o) => blocked.has(o.attemptId))).toBe(false);
  });

  it("gives every officer a list worth prioritising", () => {
    const perOfficer = new Map<string, number>();
    for (const a of sim.assignments) {
      if (a.endedAt === null) perOfficer.set(a.officer, (perOfficer.get(a.officer) ?? 0) + 1);
    }
    expect(perOfficer.size).toBe(7);
    for (const n of perOfficer.values()) expect(n).toBeGreaterThanOrEqual(8);
  });
});
