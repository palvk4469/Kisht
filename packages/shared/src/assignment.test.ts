import { describe, expect, it } from "vitest";
import { assignLoans, type OfficerTerritory } from "./assignment.js";

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
