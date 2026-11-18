import type { CustomerVisitPurpose, CustomerVisitStatus } from "@prisma/client";

/**
 * Customer visits (2026-11-18, user-specified): a relationship manager visits
 * every billing society at least once a month and logs each visit with its
 * agenda; someone else approves it, and only then does it count. Of the
 * several reasons to visit, one is required each month — feedback &
 * upselling. The rules are pure here so the board, the founders' page and
 * the actions read one answer.
 *
 * Defaults the user accepted ("build it with your defaults"):
 * - approving is its own permission (approve_visits), never one's own visit;
 * - only an APPROVED feedback_upsell visit meets the month's requirement —
 *   other purposes are recorded but never stand in for it;
 * - the phone's location is recorded when it allows, with its distance from
 *   the society's recorded location;
 * - a society is late only in the month's last 7 days.
 */

export const PURPOSE_LABEL: Record<CustomerVisitPurpose, string> = {
  feedback_upsell: "Feedback & upselling",
  complaint_followup: "Complaint follow-up",
  payment_followup: "Payment follow-up",
  committee_meeting: "Committee meeting",
  other: "Something else",
};

export const INTEREST_LABEL = {
  water_tanks: "Water tank monitoring",
  pump_automation: "Pump-room automation",
  more_lighting: "More lighting areas",
} as const;
export type Interest = keyof typeof INTEREST_LABEL;

export const STATUS_LABEL: Record<CustomerVisitStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  sent_back: "Sent back",
};

/** Where a society's required visit stands for the month. */
export type MonthVisitState = "approved" | "pending" | "sent_back" | "missing";

export function monthVisitState(visits: { purpose: CustomerVisitPurpose; status: CustomerVisitStatus; voided: boolean }[]): MonthVisitState {
  const feedback = visits.filter((v) => v.purpose === "feedback_upsell" && !v.voided);
  if (feedback.some((v) => v.status === "approved")) return "approved";
  if (feedback.some((v) => v.status === "pending")) return "pending";
  if (feedback.some((v) => v.status === "sent_back")) return "sent_back";
  return "missing";
}

export const LATE_IN_LAST_DAYS = 7;

/** Days left in the month after `today` (YYYY-MM-DD), counting today. */
export function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1;
}

/** A society without its approved feedback visit is late once the month is in its last 7 days. */
export function isVisitLate(state: MonthVisitState, today: string): boolean {
  return state !== "approved" && daysLeftInMonth(today) <= LATE_IN_LAST_DAYS;
}

export type VisitInput = {
  societyId: string;
  visitedAt: Date;
  purpose: CustomerVisitPurpose;
  agenda: string;
  outcome: string;
  rating: number | null;
  interests: string[];
  photoKeys: string[];
};

/** Everything wrong with a logged visit, in words. `now` is India's wall clock, as the visit time is typed. */
export function refuseVisit(v: VisitInput, now: Date): string | null {
  if (!v.societyId) return "Choose the society.";
  if (Number.isNaN(v.visitedAt.getTime())) return "Enter when the visit happened.";
  if (v.visitedAt.getTime() > now.getTime() + 5 * 60 * 1000) return "A visit cannot be logged before it happens.";
  if (!(v.purpose in PURPOSE_LABEL)) return "Choose what the visit was for.";
  if (v.agenda.trim().length < 5) return "Say what the visit was for — the agenda.";
  if (v.outcome.trim().length < 5) return "Say what happened at the visit.";
  if (v.purpose === "feedback_upsell") {
    if (v.rating === null || !Number.isInteger(v.rating) || v.rating < 1 || v.rating > 5) return "Record how satisfied the society is, 1 to 5.";
  } else if (v.rating !== null) {
    return "A satisfaction rating belongs only on a feedback & upselling visit.";
  }
  const bad = v.interests.filter((i) => !(i in INTEREST_LABEL));
  if (bad.length) return "Unknown service interest.";
  if (v.photoKeys.length > 4) return "Up to 4 photos.";
  return null;
}

/** Who may approve or send back a visit. */
export function refuseReview(i: { actorId: string; loggedById: string; canApprove: boolean; status: CustomerVisitStatus; voided: boolean }): string | null {
  if (!i.canApprove) return "Approving visits needs the Approve visits permission.";
  if (i.actorId === i.loggedById) return "Someone else must approve a visit you logged.";
  if (i.voided) return "This visit was withdrawn.";
  if (i.status !== "pending") return i.status === "approved" ? "This visit is already approved." : "This visit was sent back — it waits for the manager to correct it.";
  return null;
}

/** Straight-line metres between two points (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** How the location reads beside a visit. Within 300 m counts as at the society. */
export function locationWords(distanceM: number | null, hasLocation: boolean): { text: string; atSociety: boolean | null } {
  if (!hasLocation) return { text: "Location not shared", atSociety: null };
  if (distanceM === null) return { text: "Location recorded — the society has no location on record to compare", atSociety: null };
  if (distanceM <= 300) return { text: `At the society (within ${Math.max(10, Math.round(distanceM / 10) * 10)} m)`, atSociety: true };
  const km = distanceM / 1000;
  return { text: `${km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(distanceM)} m`} from the society`, atSociety: false };
}
