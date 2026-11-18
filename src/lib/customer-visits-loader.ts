import type { CustomerVisitPurpose, CustomerVisitStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istWallClock } from "@/lib/field-today";
import { loadSocietyStandings } from "@/lib/society-standing-loader";
import { daysLeftInMonth, isVisitLate, monthVisitState, type MonthVisitState } from "@/lib/customer-visits";

/**
 * The customer-visits reads (2026-11-18): one loader for the board and the
 * founders' page, so both say the same thing about a society's month. The
 * societies owed a visit are the billing ones (active or suspended) — the
 * same set the monthly close desk works through.
 */

export type BoardVisit = {
  id: string;
  purpose: CustomerVisitPurpose;
  status: CustomerVisitStatus;
  visitedAt: Date;
  rating: number | null;
  interests: string[];
  loggedBy: string;
};

export type BoardRow = {
  societyId: string;
  name: string;
  state: MonthVisitState;
  feedback: BoardVisit | null;
  others: BoardVisit[];
  lastVisitAt: Date | null;
  late: boolean;
};

export function istToday(now: Date = new Date()): string {
  return istWallClock(now).toISOString().slice(0, 10);
}

export async function loadVisitBoard(period: string, now: Date = new Date()) {
  const today = istToday(now);
  const isCurrent = today.slice(0, 7) === period;
  const standings = await loadSocietyStandings();
  const ids = [...standings.entries()].filter(([, s]) => s.standing === "active" || s.standing === "suspended").map(([id]) => id);
  const [societies, visits, lastVisits] = await Promise.all([
    db.society.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.customerVisit.findMany({
      where: { period, voidedAt: null },
      orderBy: { visitedAt: "desc" },
      select: { id: true, societyId: true, purpose: true, status: true, visitedAt: true, rating: true, interests: true, loggedBy: { select: { name: true, email: true } } },
    }),
    db.customerVisit.groupBy({ by: ["societyId"], where: { voidedAt: null, societyId: { in: ids } }, _max: { visitedAt: true } }),
  ]);
  const last = new Map(lastVisits.map((l) => [l.societyId, l._max.visitedAt]));
  const rank: Record<CustomerVisitStatus, number> = { approved: 0, pending: 1, sent_back: 2 };

  const rows: BoardRow[] = societies.map((s) => {
    const mine = visits
      .filter((v) => v.societyId === s.id)
      .map((v): BoardVisit & { societyId: string } => ({ ...v, loggedBy: v.loggedBy.name ?? v.loggedBy.email }));
    const state = monthVisitState(mine.map((v) => ({ purpose: v.purpose, status: v.status, voided: false })));
    const feedback = mine.filter((v) => v.purpose === "feedback_upsell").sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null;
    return {
      societyId: s.id,
      name: s.name,
      state,
      feedback,
      others: mine.filter((v) => v.purpose !== "feedback_upsell"),
      lastVisitAt: last.get(s.id) ?? null,
      // Late only while the month is still running and in its last 7 days;
      // a past month that ended without one is simply missed.
      late: isCurrent ? isVisitLate(state, today) : state !== "approved",
    };
  });

  const approvedFeedback = visits.filter((v) => v.purpose === "feedback_upsell" && v.status === "approved" && v.rating !== null);
  return {
    period,
    today,
    daysLeft: isCurrent ? daysLeftInMonth(today) : 0,
    isCurrent,
    rows,
    counts: {
      societies: rows.length,
      approved: rows.filter((r) => r.state === "approved").length,
      waiting: visits.filter((v) => v.status === "pending").length,
      missing: rows.filter((r) => r.state !== "approved" && r.state !== "pending").length,
      pendingSocieties: rows.filter((r) => r.state === "pending").length,
      visits: visits.length,
      leads: visits.filter((v) => v.interests.length > 0 && v.status !== "sent_back").length,
      averageRating: approvedFeedback.length ? approvedFeedback.reduce((n, v) => n + (v.rating ?? 0), 0) / approvedFeedback.length : null,
    },
  };
}

export type VisitBoard = Awaited<ReturnType<typeof loadVisitBoard>>;

/** Visits waiting for approval longer than this show on the founders' page. */
export const VISIT_APPROVAL_LATE_DAYS = 2;

export async function staleVisitApprovals(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - VISIT_APPROVAL_LATE_DAYS * 86_400_000);
  return db.customerVisit.findMany({
    where: { status: "pending", voidedAt: null, loggedAt: { lt: cutoff } },
    orderBy: { loggedAt: "asc" },
    select: { id: true, loggedAt: true, purpose: true, society: { select: { name: true } } },
  });
}
