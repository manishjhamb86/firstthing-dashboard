/**
 * The notification shape and its display categories, split out of
 * `notifications.ts` (2026-10-07) — that module imports `@/lib/db`, which
 * drags Prisma's `pg` driver into the browser bundle the moment anything
 * from it is imported by a Client Component, whatever export is actually
 * used. `notifications-client.tsx` only ever needed the plain data shape and
 * this label map, never the DB-backed loaders — so they live here, with no
 * imports of their own, safe from either side of the Server/Client boundary.
 * The same class of bug already fixed once for `circuit-label.ts`.
 */

export type Notification = {
  id: string;
  kind: string;
  message: string;
  openedAt: string;
  closedAt: string | null;
  closedReason: string | null;
  acknowledgedAt: string | null;
  /** How many times this same condition has come back after acknowledgement. */
  raiseCount: number;
  /** What the alert is about — a meter's name, or a circuit's label. */
  subject: string;
  societyName: string | null;
  circuitLabel: string | null;
  ownerLabel: string | null;
  href: string;
};

/**
 * Which of a handful of broad groups a notification belongs to — the axis a
 * reader actually navigates by ("show me the billing ones", "just meters")
 * when the open list runs past a screenful. Kept separate from `kind` itself
 * since several kinds (the three `billing_*` phases, say) are one category.
 */
export type NotificationCategory = "meter" | "billing" | "inspection" | "request" | "help" | "followup";

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  meter: "Meters",
  billing: "Billing",
  inspection: "Inspections",
  request: "Society requests",
  help: "Field help",
  followup: "Replacement follow-ups",
};

export function notificationCategory(kind: string): NotificationCategory {
  if (kind.startsWith("billing_")) return "billing";
  if (kind === "inspection_overdue") return "inspection";
  if (kind === "ticket_open") return "request";
  if (kind === "help_open") return "help";
  if (kind === "replacement_followup_open") return "followup";
  return "meter";
}
