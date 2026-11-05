import { describe, expect, it } from "vitest";
import { assignLoans, type OfficerTerritory } from "./assignment.ts";

const officers: OfficerTerritory[] = [
  { officerId: "rahul", pincodes: ["452001", "452002"] },
  { officerId: "neha", pincodes: ["452002", "452003"] },
  { officerId: "imran", pincodes: ["454775"] },
];

describe("assignLoans", () => {
  it("keeps a loan with its current officer while they cover the pincode", () => {
    const r = assignLoans(
      [{ loanId: "L1", pincode: "452002", currentOfficerId: "neha" }],
      officers,
    );
    expect(r.assigned).toEqual([{ loanId: "L1", officerId: "neha", kind: "KEPT" }]);
  });

  it("moves a loan when its officer no longer covers the pincode", () => {
    const r = assignLoans(
      [{ loanId: "L1", pincode: "454775", currentOfficerId: "rahul" }],
      officers,
    );
    expect(r.assigned).toEqual([
      { loanId: "L1", officerId: "imran", kind: "MOVED", previousOfficerId: "rahul" },
    ]);
  });

  it("gives new loans to the least-loaded covering officer", () => {
    const r = assignLoans(
      [
        { loanId: "L1", pincode: "452002", currentOfficerId: "rahul" },
        { loanId: "L2", pincode: "452002", currentOfficerId: "rahul" },
        { loanId: "L3", pincode: "452002", currentOfficerId: null },
        { loanId: "L4", pincode: "452002", currentOfficerId: null },
      ],
      officers,
    );
    const byLoan = Object.fromEntries(r.assigned.map((a) => [a.loanId, a.officerId]));
    // Rahul keeps his two; both new loans go to Neha, who had none.
    expect(byLoan).toEqual({ L1: "rahul", L2: "rahul", L3: "neha", L4: "neha" });
    expect(r.loadByOfficer.get("rahul")).toBe(2);
    expect(r.loadByOfficer.get("neha")).toBe(2);
  });

  it("sends loans in uncovered pincodes to the manager queue", () => {
    const r = assignLoans(
      [{ loanId: "L1", pincode: "999999", currentOfficerId: "rahul" }],
      officers,
    );
    expect(r.assigned).toEqual([]);
    expect(r.unassigned).toEqual([{ loanId: "L1", reason: "NO_OFFICER_FOR_PINCODE" }]);
  });

  it("is deterministic regardless of input order", () => {
    const loans = ["L3", "L1", "L4", "L2"].map((loanId) => ({
      loanId,
      pincode: "452002",
      currentOfficerId: null,
    }));
    const a = assignLoans(loans, officers).assigned;
    const b = assignLoans([...loans].reverse(), [...officers].reverse()).assigned;
    expect(a).toEqual(b);
  });

  it("never leaves a covered loan unowned, however many there are", () => {
    const loans = Array.from({ length: 500 }, (_, i) => ({
      loanId: `L${i}`,
      pincode: i % 2 ? "452001" : "452003",
      currentOfficerId: null,
    }));
    const r = assignLoans(loans, officers);
    expect(r.assigned).toHaveLength(500);
    expect(r.unassigned).toHaveLength(0);
  });
});

describe("at the brief's scale: 55 officers, about 500 loans", () => {
  // 11 areas of 5 officers sharing 3 pincodes, plus one pincode nobody covers.
  const AREAS = 11;
  const PER_AREA = 5;
  const pincodeOf = (area: number, n: number) => `4520${String(area * 3 + n).padStart(2, "0")}`;
  const officerOf = (area: number, n: number) => `officer-${area}-${n}`;
  const team: OfficerTerritory[] = Array.from({ length: AREAS * PER_AREA }, (_, i) => {
    const area = Math.floor(i / PER_AREA);
    return {
      officerId: officerOf(area, i % PER_AREA),
      pincodes: [0, 1, 2].map((n) => pincodeOf(area, n)),
    };
  });
  const UNCOVERED = "459999";

  // A third already held by an officer in the area, 11 held by one who left it, the rest new.
  const loans = Array.from({ length: 495 }, (_, i) => {
    const area = i % AREAS;
    const held = i % 3 === 0;
    const leftArea = i % 45 === 1;
    return {
      loanId: `L${i}`,
      pincode: pincodeOf(area, i % 3),
      currentOfficerId: leftArea
        ? officerOf((area + 1) % AREAS, 0)
        : held
          ? officerOf(area, i % PER_AREA)
          : null,
    };
  });
  const uncovered = Array.from({ length: 12 }, (_, i) => ({
    loanId: `U${i}`,
    pincode: UNCOVERED,
    currentOfficerId: null,
  }));
  const result = assignLoans([...loans, ...uncovered], team);
  const officerFor = new Map(result.assigned.map((a) => [a.loanId, a.officerId]));

  it("assigns every covered loan, to someone who covers its pincode", () => {
    expect(result.assigned).toHaveLength(loans.length);
    for (const loan of loans) {
      const officer = team.find((o) => o.officerId === officerFor.get(loan.loanId));
      expect(officer?.pincodes).toContain(loan.pincode);
    }
  });

  it("keeps a loan with its officer while they cover the pincode", () => {
    const stays = loans.filter(
      (l) =>
        l.currentOfficerId &&
        l.currentOfficerId.split("-")[1] === String(Number(l.loanId.slice(1)) % AREAS),
    );
    expect(stays.length).toBeGreaterThan(100);
    for (const loan of stays) expect(officerFor.get(loan.loanId)).toBe(loan.currentOfficerId);
  });

  it("moves a loan whose officer left the area", () => {
    const moved = result.assigned.filter((a) => a.kind === "MOVED");
    expect(moved).toHaveLength(11);
  });

  it("balances workloads: nobody is more than 2 loans from anyone else", () => {
    const loads = team.map((o) => result.loadByOfficer.get(o.officerId) ?? 0);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(2);
  });

  it("sends a pincode nobody covers to the manager's queue", () => {
    expect(result.unassigned.map((u) => u.loanId).sort()).toEqual(
      uncovered.map((u) => u.loanId).sort(),
    );
  });
});
