import { IsoDaySchema } from "@kisht/domain";
import { z } from "zod";

export const MAX_IMPORT_CSV_BYTES = 8 * 1024 * 1024;

export const ImportStatus = z.enum(["PREVIEW", "COMMITTED", "SUPERSEDED", "FAILED"]);
export type ImportStatus = z.infer<typeof ImportStatus>;

export const RowError = z.object({
  row: z.number().int(),
  field: z.string(),
  message: z.string(),
  loanNo: z.string().optional(),
});
export type RowError = z.infer<typeof RowError>;

const count = z.number().int().nonnegative();

export const ImportSummary = z.object({
  asOfDate: IsoDaySchema,
  rows: count,
  errors: count,
  skippedOtherBranches: count,
  newLoans: count,
  cured: count,
  /** Loans on the previous list, which the cured count is measured against. */
  previousList: count,
  /** So many loans are missing that the file may be incomplete: commit needs a confirmation. */
  curedNeedsConfirmation: z.boolean(),
  payments: count,
  replacesExisting: z.boolean(),
  assignment: z.object({
    kept: count,
    new: count,
    moved: count,
    unassigned: count,
    byOfficer: z.array(z.object({ officerId: z.string(), name: z.string(), loans: count })),
  }),
  /** Only after commit: how pending promises resolved against this day's data. */
  promises: z.object({ kept: count, partial: count, broken: count }).optional(),
});
export type ImportSummary = z.infer<typeof ImportSummary>;

export const ImportPreviewBody = z.object({
  asOfDate: IsoDaySchema,
  fileName: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(MAX_IMPORT_CSV_BYTES),
});
export type ImportPreviewBody = z.infer<typeof ImportPreviewBody>;

export const ImportCommitBody = z.object({
  /** "I confirm these loans are no longer overdue." Required when the summary asks for it. */
  confirmCured: z.boolean(),
});
export type ImportCommitBody = z.infer<typeof ImportCommitBody>;

export const ImportPreview = z.object({
  id: z.string(),
  status: z.literal("PREVIEW"),
  summary: ImportSummary,
  /** The first 200 row errors; the summary has the total. */
  errors: z.array(RowError),
});
export type ImportPreview = z.infer<typeof ImportPreview>;

export const ImportCommitted = z.object({
  id: z.string(),
  status: z.literal("COMMITTED"),
  summary: ImportSummary,
});
export type ImportCommitted = z.infer<typeof ImportCommitted>;

export const ImportHistoryItem = z.object({
  id: z.string(),
  asOfDate: IsoDaySchema,
  fileName: z.string(),
  status: ImportStatus,
  rowCount: count,
  errorCount: count,
  uploadedBy: z.string(),
  createdAt: z.iso.datetime(),
  committedAt: z.iso.datetime().nullable(),
});
export type ImportHistoryItem = z.infer<typeof ImportHistoryItem>;

export const ImportHistory = z.array(ImportHistoryItem);
