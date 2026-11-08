import { z } from "zod";
import { type IsoDay, isIsoDay } from "./dates.ts";

// Parsing and validation of the loan system's daily overdue export (A1).
//
// Real exports are messy: Excel adds a byte-order mark and CRLF line endings,
// amounts come as "6,40,000" or "₹6,40,000", dates as 05/11/2026, phone
// numbers with +91. We normalise what is unambiguous and reject the rest with
// a row-level message, so one bad row never blocks the other 199.

export const OVERDUE_COLUMNS = [
  "loan_id",
  "borrower_name",
  "business_type",
  "phone",
  "address",
  "pincode",
  "outstanding",
  "dpd",
  "emi_amount",
  "last_payment_date",
  "last_payment_amount",
  "branch_code",
] as const;

export const MAX_IMPORT_ROWS = 20_000;

/** Example rows for the downloadable template: the brief's sample loans, in export format. */
export const OVERDUE_TEMPLATE_ROWS: readonly string[] = [
  'LN-10293,Company B (packaging unit),packaging unit,9000012345,"Plot 117, Siyaganj, Indore 452001",452001,640000,12,26700,2026-09-21,26700,IND',
  'LN-11930,Company D (printing press),printing press,9000054321,"Plot 8, Sector 1, Pithampur 454775",454775,220000,19,9200,2026-09-14,9200,PTH',
];

export type OverdueRow = {
  /** Row number as shown in Excel (header is row 1), for error messages. */
  row: number;
  loanNo: string;
  borrowerName: string;
  businessType: string;
  phone: string;
  address: string;
  pincode: string;
  outstanding: number;
  dpd: number;
  emiAmount: number;
  lastPaymentDate: IsoDay | null;
  lastPaymentAmount: number | null;
  branchCode: string;
};

export type RowError = {
  row: number;
  field: string;
  message: string;
  /** The loan the bad row is about, if it could be read: it isn't missing, just unusable. */
  loanNo?: string;
};

export type ParsedImport = {
  rows: OverdueRow[];
  errors: RowError[];
  /** Problems with the file as a whole (missing columns, empty file). */
  fileErrors: string[];
  totalRows: number;
};

/** RFC 4180 CSV: quoted fields, "" escapes, CRLF or LF, commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a trailing newline, or Excel's empty rows).
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const normaliseHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const rupees = (field: string) =>
  z
    .string()
    .transform((s) => s.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, ""))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, `${field} must be a rupee amount`)
        .transform((s) => Math.round(Number(s))),
    );

// Accepts 2026-11-05, 05-11-2026 and 05/11/2026 (day first, as Indian exports are).
const day = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? s
      : s.replace(/^(\d{2})[/-](\d{2})[/-](\d{4})$/, "$3-$2-$1");
    if (!isIsoDay(iso)) {
      ctx.addIssue({ code: "custom", message: "must be a date like 2026-11-05 or 05/11/2026" });
      return z.NEVER;
    }
    return iso;
  });

const optional = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.union([z.literal("").transform(() => null), schema]));

const RowSchema = z.object({
  loan_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, "must look like LN-10293"),
  borrower_name: z.string().trim().min(1, "is required").max(200),
  business_type: z.string().trim().max(100),
  phone: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|0091|0)(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "must be a 10-digit Indian mobile number")),
  address: z.string().trim().max(500),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "must be a 6-digit pincode"),
  outstanding: rupees("outstanding"),
  dpd: z
    .string()
    .trim()
    .regex(/^\d+$/, "must be a whole number of days")
    .transform(Number)
    .pipe(z.number().int().min(1, "must be at least 1 (this is an overdue list)").max(3650)),
  emi_amount: rupees("emi_amount"),
  last_payment_date: optional(day),
  last_payment_amount: optional(rupees("last_payment_amount")),
  branch_code: z.string().trim().toUpperCase().min(1, "is required"),
});

export function parseOverdueCsv(text: string, today: IsoDay): ParsedImport {
  const table = parseCsv(text);
  const [header, ...body] = table;
  if (!header) return { rows: [], errors: [], fileErrors: ["The file is empty."], totalRows: 0 };

  const columns = header.map(normaliseHeader);
  const missing = OVERDUE_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [],
      fileErrors: [`Missing columns: ${missing.join(", ")}.`],
      totalRows: body.length,
    };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [],
      fileErrors: [`Too many rows (${body.length}); the limit is ${MAX_IMPORT_ROWS}.`],
      totalRows: body.length,
    };
  }

  const rows: OverdueRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  body.forEach((cells, i) => {
    // Row numbers as a person sees them in Excel: header is row 1.
    const rowNo = i + 2;
    const record = Object.fromEntries(columns.map((c, j) => [c, cells[j] ?? ""]));
    const parsed = RowSchema.safeParse(record);
    if (!parsed.success) {
      const loanNo = RowSchema.shape.loan_id.safeParse(record.loan_id).data;
      for (const issue of parsed.error.issues) {
        errors.push({
          row: rowNo,
          field: String(issue.path[0] ?? "row"),
          message: issue.message,
          loanNo,
        });
      }
      return;
    }
    const r = parsed.data;
    if (r.last_payment_date && r.last_payment_date > today) {
      errors.push({
        row: rowNo,
        field: "last_payment_date",
        message: "is in the future",
        loanNo: r.loan_id,
      });
      return;
    }
    if ((r.last_payment_date === null) !== (r.last_payment_amount === null)) {
      errors.push({
        row: rowNo,
        field: "last_payment_amount",
        message: "last payment date and amount must both be given or both be empty",
        loanNo: r.loan_id,
      });
      return;
    }
    const firstRow = seen.get(r.loan_id);
    if (firstRow) {
      errors.push({ row: rowNo, field: "loan_id", message: `duplicates row ${firstRow}` });
      return;
    }
    seen.set(r.loan_id, rowNo);
    rows.push({
      row: rowNo,
      loanNo: r.loan_id,
      borrowerName: r.borrower_name,
      businessType: r.business_type,
      phone: r.phone,
      address: r.address,
      pincode: r.pincode,
      outstanding: r.outstanding,
      dpd: r.dpd,
      emiAmount: r.emi_amount,
      lastPaymentDate: r.last_payment_date,
      lastPaymentAmount: r.last_payment_amount,
      branchCode: r.branch_code,
    });
  });

  return { rows, errors, fileErrors: [], totalRows: body.length };
}

// Writing CSV: every download the app offers goes through here.

export type CsvCell = string | number | boolean | null | undefined;

/** Text a spreadsheet would run as a formula when the file is opened. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell. Text that starts like a formula gets a leading apostrophe, so a
 * note typed in the field can't run in a manager's spreadsheet (CSV injection).
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return `${lines.join("\n")}\n`;
}
