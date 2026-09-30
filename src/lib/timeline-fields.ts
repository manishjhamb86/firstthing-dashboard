/**
 * The dates the society timeline can correct (2026-09-28), and how a value
 * for one is written down. Plain module — no db — so the timeline's client
 * editor and the change-request queue read the same names and the same value
 * shape the server checks.
 *
 * A value is a day, `YYYY-MM-DD`, or for a period `YYYY-MM-DD/YYYY-MM-DD`.
 * It is stored that way on a change request (the value the requester saw and
 * the value they asked for), so a request is readable without the record.
 */
import { formatDate } from "@/lib/format-date";

export const TIMELINE_FIELDS = {
  "engagement.createdAt": { label: "Service line enrolled", range: false, live: true },
  "pipeline.createdAt": { label: "Lead logged", range: false, live: true },
  "pipeline.meetingDate": { label: "Demo meeting held", range: false, live: true },
  // correctProposalDate is a demo-mode act only: the decision is stamped when
  // the proposal is recorded, and moving it once live needs its own decision.
  "pipeline.proposalDecidedAt": { label: "Proposal decided", range: false, live: false },
  "pipeline.surveyAssignedAt": { label: "Survey assigned", range: false, live: true },
  "pipeline.survey": { label: "Site survey done", range: false, live: true },
  "demo.meterInstalledAt": { label: "Meter installed", range: false, live: true },
  "demo.pre": { label: "Before-installation readings", range: true, live: true },
  "demo.replacementAssignedAt": { label: "Replacement assigned to a crew", range: false, live: true },
  "demo.lightReplacementDate": { label: "Lights replaced", range: false, live: true },
  "demo.post": { label: "After-installation readings", range: true, live: true },
  "offer.issuedAt": { label: "Offer issued", range: false, live: true },
  "offer.respondedAt": { label: "Offer responded to", range: false, live: true },
  "agreement.preparedAt": { label: "Agreement prepared", range: false, live: true },
  "agreement.printedAt": { label: "Agreement printed", range: false, live: true },
  "agreement.notarizedAt": { label: "Agreement notarised", range: false, live: true },
  "agreement.signedAt": { label: "Agreement signed", range: false, live: true },
  "agreement.uploadedAt": { label: "Signed scan uploaded", range: false, live: true },
  "contract.activatedAt": { label: "Contract activated", range: false, live: true },
  "contract.term": { label: "Contract term", range: true, live: true },
  "certificate.signedAt": { label: "Installation certificate signed", range: false, live: true },
} as const satisfies Record<string, { label: string; range: boolean; live: boolean }>;

export type TimelineField = keyof typeof TIMELINE_FIELDS;

export function isTimelineField(s: string): s is TimelineField {
  return Object.prototype.hasOwnProperty.call(TIMELINE_FIELDS, s);
}

export type DayRange = { from: string; to: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A Date at UTC midnight, as the value an `<input type="date">` holds. */
export function dayValue(d: Date | null | undefined): string | null {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export function encodeValue(from: Date | null | undefined, to?: Date | null): string | null {
  const a = dayValue(from);
  if (to === undefined) return a;
  const b = dayValue(to);
  return a && b ? `${a}/${b}` : null;
}

/** Reads a stored value back. Null when it is not a well-formed day or period. */
export function parseValue(v: string | null | undefined, range: boolean): { from: Date; to: Date | null } | null {
  if (!v) return null;
  const parts = v.split("/");
  if (range ? parts.length !== 2 : parts.length !== 1) return null;
  if (!parts.every((p) => DAY.test(p))) return null;
  const from = new Date(`${parts[0]}T00:00:00.000Z`);
  const to = range ? new Date(`${parts[1]}T00:00:00.000Z`) : null;
  if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime()))) return null;
  // A day like 2026-02-31 parses as 03-03: refuse it rather than move it.
  if (dayValue(from) !== parts[0] || (to && dayValue(to) !== parts[1])) return null;
  return { from, to };
}

/** A value for a person: DD-Mon-YYYY, or DD-Mon-YYYY → DD-Mon-YYYY. */
export function valueLabel(v: string | null | undefined): string {
  if (!v) return "No date";
  return v
    .split("/")
    .map((p) => (DAY.test(p) ? formatDate(new Date(`${p}T00:00:00.000Z`)) : p))
    .join(" → ");
}
