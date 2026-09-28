import { db } from "@/lib/db";
import { formatInstant } from "@/lib/format-date";
import { currentValue, locate, type Branch } from "@/lib/society-chronology";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/date-change-request";
import { isTimelineField, TIMELINE_FIELDS, valueLabel } from "@/lib/timeline-fields";
import type { RequestCardData, RequestVM } from "@/lib/society-timeline-view";

/**
 * Date change requests read for the timeline and the approvals queue
 * (2026-09-28). A pending request is marked stale when the date on record no
 * longer equals the one its requester saw — the approver can then only close
 * it, never apply it over a change nobody reviewed.
 */

const select = {
  id: true,
  societyId: true,
  field: true,
  entityId: true,
  context: true,
  fromValue: true,
  toValue: true,
  reason: true,
  warnings: true,
  status: true,
  requestedAt: true,
  requestedById: true,
  decidedAt: true,
  decisionNote: true,
  requestedBy: { select: { name: true, email: true } },
  decidedBy: { select: { name: true, email: true } },
} as const;

type Row = Awaited<ReturnType<typeof loadRows>>[number];
function loadRows(where: Parameters<typeof db.dateChangeRequest.findMany>[0]) {
  return db.dateChangeRequest.findMany({ ...where, select });
}

function card(r: Row, viewerId: string, root: Branch | null): RequestCardData {
  const known = isTimelineField(r.field);
  const ref = known ? { field: r.field as keyof typeof TIMELINE_FIELDS, entityId: r.entityId } : null;
  const now = ref && root ? currentValue(root, ref) : null;
  const where = ref && root ? locate(root, ref) : null;
  const who = (u: { name: string | null; email: string } | null) => (u ? u.name ?? u.email : "someone");
  const status = r.status as RequestStatus;
  return {
    id: r.id,
    societyId: r.societyId,
    context: r.context,
    label: where?.label ?? (known ? TIMELINE_FIELDS[r.field as keyof typeof TIMELINE_FIELDS].label : r.field),
    from: valueLabel(r.fromValue),
    to: valueLabel(r.toValue),
    reason: r.reason,
    by: who(r.requestedBy),
    at: formatInstant(r.requestedAt),
    warnings: r.warnings,
    mine: r.requestedById === viewerId,
    stale: status === "pending" && !!now && (now.found ? now.value : null) !== r.fromValue,
    status,
    statusLabel: REQUEST_STATUS_LABEL[status],
    decision: r.decidedAt
      ? `${status === "withdrawn" ? "Withdrawn" : "Decided"} by ${who(r.decidedBy)} on ${formatInstant(r.decidedAt)}${r.decisionNote ? ` — ${r.decisionNote}` : ""}`
      : null,
  };
}

/** A society's open requests, as rows on its timeline and as cards. */
export async function societyRequests(societyId: string, root: Branch, viewerId: string) {
  const rows = await loadRows({ where: { societyId, status: "pending" }, orderBy: { requestedAt: "asc" } });
  const byRef = new Map<string, RequestVM[]>();
  for (const r of rows) {
    const vm: RequestVM = {
      id: r.id,
      from: valueLabel(r.fromValue),
      to: valueLabel(r.toValue),
      reason: r.reason,
      by: r.requestedBy.name ?? r.requestedBy.email,
      at: formatInstant(r.requestedAt),
      mine: r.requestedById === viewerId,
    };
    const key = `${r.field}|${r.entityId}`;
    byRef.set(key, [...(byRef.get(key) ?? []), vm]);
  }
  return { byRef, cards: rows.map((r) => card(r, viewerId, root)) };
}

/** Every open request, and the most recent decisions, across societies. */
export async function requestQueue(viewerId: string) {
  const [pending, decided] = await Promise.all([
    loadRows({ where: { status: "pending" }, orderBy: { requestedAt: "asc" } }),
    loadRows({ where: { status: { not: "pending" } }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);
  const roots = new Map<string, Branch | null>();
  for (const id of new Set(pending.map((r) => r.societyId))) {
    roots.set(id, (await loadSocietyTimeline(id))?.root ?? null);
  }
  return {
    pending: pending.map((r) => card(r, viewerId, roots.get(r.societyId) ?? null)),
    decided: decided.map((r) => card(r, viewerId, null)),
  };
}
