import { describe, expect, it } from "vitest";
import { OVERDUE_COLUMNS, parseCsv, parseOverdueCsv } from "./csv.js";

const TODAY = "2026-11-02";
const header = OVERDUE_COLUMNS.join(",");
const good =
  'LN-10293,Company B (packaging unit),packaging unit,9000012345,"Plot 4, Siyaganj, Indore",452001,640000,12,26700,2026-09-21,26700,IND';

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas inside quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("strips the byte-order mark Excel adds", () => {
    expect(parseCsv("﻿loan_id\nLN-1")).toEqual([["loan_id"], ["LN-1"]]);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a\n\n,\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("parseOverdueCsv", () => {
  it("parses a clean row", () => {
    const r = parseOverdueCsv(`${header}\n${good}\n`, TODAY);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        loanNo: "LN-10293",
        borrowerName: "Company B (packaging unit)",
        businessType: "packaging unit",
        phone: "9000012345",
        address: "Plot 4, Siyaganj, Indore",
        pincode: "452001",
        outstanding: 640000,
        dpd: 12,
        emiAmount: 26700,
        lastPaymentDate: "2026-09-21",
        lastPaymentAmount: 26700,
        branchCode: "IND",
      },
    ]);
  });

  it("normalises Indian formats: ₹ and lakh commas, +91 phones, DD/MM/YYYY dates", () => {
    const row =
      'ln-10293,Company B,packaging,+91 90000 12345,-,452001,"₹6,40,000",12,"26,700",21/09/2026,26700,ind';
    const [parsed] = parseOverdueCsv(`${header}\n${row}`, TODAY).rows;
    expect(parsed).toMatchObject({
      loanNo: "LN-10293",
      phone: "9000012345",
      outstanding: 640000,
      emiAmount: 26700,
      lastPaymentDate: "2026-09-21",
      branchCode: "IND",
    });
  });

  it("accepts headers in any order and case", () => {
    const shuffled = [...OVERDUE_COLUMNS].reverse();
    const values = Object.fromEntries(
      OVERDUE_COLUMNS.map((c, i) => [c, parseCsv(good)[0]?.[i] ?? ""]),
    );
    const csv = `${shuffled.map((c) => c.toUpperCase().replace(/_/g, " ")).join(",")}\n${shuffled
      .map((c) => `"${values[c]}"`)
      .join(",")}`;
    expect(parseOverdueCsv(csv, TODAY).rows[0]?.loanNo).toBe("LN-10293");
  });

  it("reports missing columns for the whole file", () => {
    const r = parseOverdueCsv("loan_id,dpd\nLN-1,4", TODAY);
    expect(r.fileErrors[0]).toMatch(/Missing columns: borrower_name/);
    expect(r.rows).toEqual([]);
  });

  it("reports an empty file", () => {
    expect(parseOverdueCsv("", TODAY).fileErrors).toEqual(["The file is empty."]);
  });

  it("rejects bad rows individually, with Excel row numbers, and keeps the good ones", () => {
    const bad = good
      .replace("9000012345", "12345")
      .replace("452001", "45200")
      .replace("LN-10293", "LN-2");
    const r = parseOverdueCsv(`${header}\n${good}\n${bad}`, TODAY);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => [e.row, e.field])).toEqual([
      [3, "phone"],
      [3, "pincode"],
    ]);
  });

  it("rejects duplicate loan ids, pointing at the first occurrence", () => {
    const r = parseOverdueCsv(`${header}\n${good}\n${good}`, TODAY);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ row: 3, field: "loan_id", message: "duplicates row 2" }]);
  });

  it("rejects DPD 0 (not overdue), future payment dates and half-filled payment columns", () => {
    const rows = [
      good.replace(",12,26700,", ",0,26700,"),
      good.replace("2026-09-21", "2026-11-09"),
      good.replace(",2026-09-21,26700,", ",2026-09-21,,"),
    ];
    const r = parseOverdueCsv([header, ...rows].join("\n"), TODAY);
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.field)).toEqual([
      "dpd",
      "last_payment_date",
      "last_payment_amount",
    ]);
  });

  it("rejects impossible dates", () => {
    const r = parseOverdueCsv(`${header}\n${good.replace("2026-09-21", "31/02/2026")}`, TODAY);
    expect(r.errors[0]?.field).toBe("last_payment_date");
  });
});
