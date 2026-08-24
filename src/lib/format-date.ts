/**
 * How a date reads in this product: DD-MM-YYYY.
 *
 * Every date in this schema is stored at UTC midnight and was being rendered
 * with `.toISOString().slice(0, 10)` — ISO order, which reads as a machine
 * value rather than a date to the people using this (user-asked 2026-08-24,
 * pointing at a lead's meeting date). The parts are read in UTC deliberately:
 * a local-time getDate() on a UTC-midnight value shifts the day backwards for
 * anyone west of Greenwich, which is exactly the class of off-by-one CON-22's
 * billing arithmetic already avoids the same way.
 *
 * Form controls are NOT this: <input type="date"> speaks ISO and only ISO, so
 * `isoDate` stays the value helper for anything the browser parses.
 */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getUTCFullYear()}`;
}
