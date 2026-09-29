/**
 * The field app's Today screen (docs/engineering/19-field-app.md §8 step 2).
 * Pure rules — the page is a thin shell around them.
 *
 * Appointments in this product are stored WALL-CLOCK: a visit typed as 10:30
 * is stored at 10:30Z and read back with UTC parts (format-date.ts). So "what
 * is today" has to be asked in the same terms — the wall-clock date where the
 * field team is, India. Taking `new Date()` on a server that runs in UTC
 * would, between midnight and 05:30 IST, call yesterday's visits "today" and
 * today's "tomorrow" — exactly the hours a crew checks its phone before
 * setting out.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Now, expressed as India's wall clock in the app's UTC-parts convention. */
export function istWallClock(now: Date): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The greeting for an hour of the (wall-clock) day. */
export function greetingFor(wallClock: Date): string {
  const h = wallClock.getUTCHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** First name for the greeting; the email's local part when there is no name. */
export function firstName(name: string | null, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  return email.split("@")[0];
}

export type TodayItem = { startAt: Date };

export type TodayPlan<T extends TodayItem> = {
  /** Open entries whose day has passed — never closed out. */
  overdue: T[];
  /** Due on today's date. */
  today: T[];
  /** The next seven days after today. */
  soon: T[];
  /** Further out; counted, not listed. */
  laterCount: number;
};

/**
 * Split open entries into the four groups Today shows. "Overdue" is a
 * property of the DAY, not the hour — the rule the schedule module already
 * holds (dayRelation): a visit booked for 10:30 is in progress at 10:31, not
 * overdue.
 */
export function planToday<T extends TodayItem>(items: T[], wallClockNow: Date): TodayPlan<T> {
  const today = dayStart(wallClockNow);
  const plan: TodayPlan<T> = { overdue: [], today: [], soon: [], laterCount: 0 };
  const sorted = [...items].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (const item of sorted) {
    const d = dayStart(item.startAt);
    if (d < today) plan.overdue.push(item);
    else if (d === today) plan.today.push(item);
    else if (d <= today + 7 * DAY_MS) plan.soon.push(item);
    else plan.laterCount += 1;
  }
  return plan;
}
