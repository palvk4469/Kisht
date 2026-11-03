// DPDP: show borrower phone numbers only when needed. Lists and detail views
// get the masked form; the full number comes from an audited reveal.
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-4)}`;
}
