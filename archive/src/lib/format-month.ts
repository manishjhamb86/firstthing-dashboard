// invoiceMonth/reportMonth are stored as "YYYY-MM" (from a native <input type="month">,
// which is what drives the S3 folder path too — see document-keys.ts) and displayed
// as a friendly label here.
export function formatMonthLabel(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value; // pre-existing free-text data from before this convention
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
