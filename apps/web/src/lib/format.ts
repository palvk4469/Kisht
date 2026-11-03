const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("en-IN");

/** ₹6,40,000 (Indian digit grouping). */
export function rupees(value: number): string {
  return inr.format(value);
}

/** ₹6.4 L / ₹1.2 Cr for tight spaces such as stat tiles. */
export function rupeesShort(value: number): string {
  if (value >= 1_00_00_000)
    return `₹${(value / 1_00_00_000).toFixed(value >= 10_00_00_000 ? 0 : 1)} Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(value >= 10_00_000 ? 0 : 1)} L`;
  return rupees(value);
}

export function number(value: number): string {
  return count.format(value);
}

/** "2 Nov 2026" from "2026-11-02", without timezone drift. */
export function day(iso: string, locale: "hi" | "en" = "en"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/** "2 Nov, 10:42 am" in IST. */
export function dateTime(value: string | Date, locale: "hi" | "en" = "en"): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
