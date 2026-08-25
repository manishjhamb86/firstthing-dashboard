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

/**
 * A date with a time on it — the survey visit, so far the only thing here
 * that happens at an hour rather than on a day. Same UTC reading as
 * formatDate: these are stored exactly as the operator typed them, because a
 * site visit is local to the site and shifting it by the viewer's zone would
 * move an appointment somebody made by phone.
 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(date)} · ${hh}:${mm}`;
}

/** The value an <input type="datetime-local"> parses. */
export function isoDateTimeLocal(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/**
 * A machine timestamp, rendered where the people reading it live.
 *
 * This is NOT formatDateTime, and the distinction is the bug it fixes
 * (user-reported 2026-08-25: "time is also showing incorrect"). There are two
 * kinds of timestamp in this product and they must be read differently:
 *
 *  · a WALL-CLOCK appointment somebody typed — a survey visit at 10:30, an
 *    installation day — is stored exactly as entered and must be echoed back
 *    exactly as entered. That is formatDateTime's UTC read, and shifting it
 *    by a zone would move an appointment somebody agreed by phone.
 *
 *  · a real INSTANT reported by a device or stamped by the system — a tank
 *    level at 11:40:48Z, a sync, a sign-in — happened at a moment in time,
 *    and a reader in India must see it in India's zone. Rendering 11:40Z as
 *    "11:40" told them a reading was 5½ hours older than it was.
 *
 * Asia/Kolkata explicitly rather than the machine's locale: the server runs
 * in UTC, so "local" on a Server Component means UTC, which is exactly the
 * wrong answer. The whole product operates in one zone.
 */
const IST = "Asia/Kolkata";

export function formatInstant(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} · ${get("hour")}:${get("minute")}`;
}

/** "2 minutes ago" / "1h 43m ago" — how stale a reading is, in words. */
export function timeAgo(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d || Number.isNaN(d.getTime())) return "never";
  // floor, not round: 30 seconds ago is 'just now', not '1 min ago'.
  const mins = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
