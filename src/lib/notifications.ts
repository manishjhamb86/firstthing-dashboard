import { cache } from "react";
import { db } from "@/lib/db";
import { circuitLabelOf } from "@/lib/meter-view";

/**
 * The notification centre's read model.
 *
 * Deliberately NOT a new table: an alert is already a durable row with an
 * open/closed lifecycle, an owner and a stated reason (`MeterAlert`), and a
 * second copy written for the bell would drift from it — the same reasoning
 * that kept the documents listing a live query rather than a shadow table.
 * What was missing was never storage; it was a place to READ them, so a
 * notification that opened and closed while nobody was looking can still be
 * found afterwards.
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

const include = {
  meter: {
    select: {
      id: true,
      name: true,
      society: { select: { name: true } },
      circuit: { select: { id: true, societyId: true, location: true, lightType: true } },
      owner: { select: { name: true, email: true } },
    },
  },
  // A commercial alert names the circuit, which may carry readings from an
  // upload and have no meter bound at all.
  circuit: {
    select: {
      id: true,
      societyId: true,
      location: true,
      lightType: true,
      society: { select: { name: true } },
      meterDevice: { select: { owner: { select: { name: true, email: true } } } },
    },
  },
} as const;

type Row = Awaited<ReturnType<typeof db.meterAlert.findMany<{ include: typeof include }>>>[number];

const invoiceInclude = {
  calculation: { select: { id: true, period: true, society: { select: { name: true } } } },
} as const;

type InvoiceRow = Awaited<
  ReturnType<typeof db.billingInvoice.findMany<{ include: typeof invoiceInclude }>>
>[number];

const INVOICE_PHASE_MESSAGE: Record<string, string> = {
  overdue: "is overdue",
  warning: "is overdue and approaching suspension",
  suspended: "is suspended — field servicing is paused",
};

/**
 * CON-13's overdue/warning/suspended invoices, folded into the same
 * notification feed as meter alerts (2026-09-12) — the arrears_sweep job
 * (scripts/job-worker.ts) is what actually writes these statuses; this is
 * only the read side, the same "derived from rows of record, no shadow
 * table" call as the alert feed itself. There is no acknowledge act for an
 * invoice the way there is for a meter alert — following up on arrears is
 * exactly the `paymentStatusConfirmedAt` action already on the calculation's
 * own page, so these stay in the feed, unacknowledged, until paid.
 */
function invoiceToNotification(i: InvoiceRow): Notification {
  return {
    id: i.id,
    kind: `billing_${i.status}`,
    message: `${i.calculation.society.name}'s ${i.calculation.period} invoice ${INVOICE_PHASE_MESSAGE[i.status] ?? i.status}.`,
    openedAt: (i.overdueTrackingAt ?? i.releasedAt ?? i.uploadedAt).toISOString(),
    closedAt: null,
    closedReason: null,
    acknowledgedAt: null,
    raiseCount: 1,
    subject: `Invoice ${i.number}`,
    societyName: i.calculation.society.name,
    circuitLabel: null,
    ownerLabel: null,
    href: `/admin/billing/${i.calculation.id}`,
  };
}

// Wrapped in cache() so the notifications page — where the nav badge
// (unreadNotificationCount) and the page body (openNotifications) both run in
// one request — issues this query once, not twice.
const openInvoiceNotifications = cache(async (): Promise<Notification[]> => {
  const rows = await db.billingInvoice.findMany({
    where: { voidedAt: null, status: { in: ["overdue", "warning", "suspended"] } },
    include: invoiceInclude,
  });
  return rows.map(invoiceToNotification);
});

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST wall-clock calendar month `n` months before the given instant, as
 *  `{ year, month }` (month 0-indexed). "Which month just closed" is a
 *  wall-clock question, not a UTC one — at 00:30 IST on the 1st the server's
 *  own UTC clock is still in the prior month, which would flag a month too
 *  early. Shift into IST first, matching this codebase's "a machine instant
 *  is read in IST" rule. */
function istMonth(now: Date, monthsAgo: number): { year: number; month: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - monthsAgo, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** `"YYYY-MM"` for the IST calendar month before `now`'s — the last period
 *  that has actually fully elapsed. */
function previousPeriod(now: Date): string {
  const { year, month } = istMonth(now, 1);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * The monthly-inspection reminder (2026-09-14) — the other half of the same
 * bundled instruction the photo-capture build closed the first half of.
 *
 * Deliberately a pure read, not a job: unlike CON-13's arrears clock there is
 * no state to advance here, only a question — "has this society's inspection
 * for the period that just closed been filed?" — that a live query answers
 * for free, so no `Job` row, no written column, nothing that can drift from
 * the `Inspection` rows it reads. The check fires once a period has FULLY
 * elapsed (the previous calendar month), not partway through the current
 * one — a society isn't "overdue" for a month that still has days left in
 * it, and picking an arbitrary day-of-month threshold to flag it early would
 * be an invented rule nobody asked for.
 *
 * Scoped to every society with an ACTIVE contract — the set already used to
 * decide who is billable (`admin/billing/page.tsx`'s own contract query) —
 * since a society with no live engagement has nothing for a field visit to
 * check. One inspection anywhere in the society for the period counts,
 * whichever area or circuit it was filed against; this is a "did anyone
 * visit," not a per-circuit requirement.
 */
/** The period the reminder is about — the last IST month to fully elapse. */
export function inspectionReminderPeriod(now = new Date()): string {
  return previousPeriod(now);
}

/**
 * `"YYYY-MM"` for the IST calendar month `now` itself falls in — the still-
 * open month a society's current-month filing status is judged against
 * (`src/lib/inspection-intelligence.ts`'s `currentMonthSummary`). Exported
 * as its own named function, symmetric with `inspectionReminderPeriod`
 * above, rather than inlining the IST-month arithmetic a second place —
 * this product's own standing rule that a machine instant is read in IST.
 */
export function currentInspectionPeriod(now = new Date()): string {
  const { year, month } = istMonth(now, 0);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Which societies owe an inspection for `period`, newest contract set first.
 *
 * Exported so the notification and the inspections page's own "not filed"
 * panel read ONE query rather than two that can disagree about who is
 * overdue — the fault this whole review pass was about.
 */
export const societiesMissingInspection = cache(
  async (period: string): Promise<{ societyId: string; name: string }[]> => {
    const societies = await db.contract.findMany({
      where: { status: "active" },
      select: { societyId: true, society: { select: { name: true } } },
      distinct: ["societyId"],
    });
    if (societies.length === 0) return [];

    // A FINALIZED inspection counts (totalLightsChecked is written only at
    // finalize) — a bare draft that was started and abandoned must not silence
    // the reminder, the same rule the portal's "latest inspection" query uses.
    const filed = await db.inspection.findMany({
      where: {
        societyId: { in: societies.map((s) => s.societyId) },
        period,
        voidedAt: null,
        totalLightsChecked: { not: null },
      },
      select: { societyId: true },
    });
    const filedIds = new Set(filed.map((f) => f.societyId));

    return societies
      .filter((s) => !filedIds.has(s.societyId))
      .map((s) => ({ societyId: s.societyId, name: s.society.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
);

/**
 * Collapsed to ONE row when more than one society owes an inspection
 * (2026-09-20, the user's call).
 *
 * A row per society is the honest shape, and it was also unreadable: with no
 * inspection ever filed against 14 active contracts, 14 of the bell's 15
 * items were the same sentence, and a badge that always reads 15 stops being
 * a signal at all. The collapsed row carries the count and links to the list
 * of exactly who, so nothing is hidden — it is one click further away.
 *
 * A single overdue society still gets its own named row: "Ace City's 2026-08
 * inspection was never filed" is more useful than "1 society has not filed",
 * and it links straight to that society's prefilled form.
 */
const openInspectionOverdueNotifications = cache(async (): Promise<Notification[]> => {
  const now = new Date();
  const period = inspectionReminderPeriod(now);
  // Start of the current IST month — the moment the previous period closed,
  // used only to order these rows in the feed.
  const cur = istMonth(now, 0);
  const closedAt = new Date(Date.UTC(cur.year, cur.month, 1) - IST_OFFSET_MS);

  const missing = await societiesMissingInspection(period);
  if (missing.length === 0) return [];

  const base = {
    kind: "inspection_overdue",
    openedAt: closedAt.toISOString(),
    closedAt: null,
    closedReason: null,
    acknowledgedAt: null,
    raiseCount: 1,
    subject: `${period} inspection`,
    circuitLabel: null,
    ownerLabel: null,
  };

  if (missing.length === 1) {
    const only = missing[0];
    return [
      {
        ...base,
        id: `inspection-overdue-${only.societyId}-${period}`,
        message: `${only.name}'s ${period} inspection was never filed.`,
        societyName: only.name,
        href: `/admin/inspections/new?societyId=${only.societyId}`,
      },
    ];
  }

  return [
    {
      ...base,
      id: `inspection-overdue-${period}`,
      message: `${missing.length} societies have no ${period} inspection on file.`,
      societyName: null,
      href: `/admin/inspections?missing=${period}`,
    },
  ];
});

/**
 * Open society requests (the portal's ticket desk).
 *
 * Folded into the feed itself (2026-09-20) rather than staying a separate
 * query the bell counted and the page re-fetched on its own. The bell already
 * added `db.ticket.count` to its total, so the notifications page had to
 * issue its own matching `findMany` to "show what the badge counted" — its
 * own comment said exactly that. Two queries kept in step by hand is the
 * shape this codebase keeps finding as a bug, and it left the Portfolio with
 * no way to show them at all without writing a third. One feed, three
 * readers.
 *
 * In-progress tickets deliberately stay out: taking one up IS the attention
 * this feed asks for.
 */
const openTicketNotifications = cache(async (): Promise<Notification[]> => {
  const rows = await db.ticket.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    include: { society: { select: { name: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    kind: "ticket_open",
    message: `${t.society.name} raised a request: ${t.subject}`,
    openedAt: t.createdAt.toISOString(),
    closedAt: null,
    closedReason: null,
    // Resolving it with a stated outcome is the act; there is no separate
    // "seen" state, so these never read as acknowledged.
    acknowledgedAt: null,
    raiseCount: 1,
    subject: t.subject,
    societyName: t.society.name,
    circuitLabel: null,
    ownerLabel: null,
    href: "/admin/tickets",
  }));
});

/**
 * Field Help reports waiting on a person (docs/engineering/21-field-help.md):
 * a bug, a blocker on site, a suggestion, a question the AI could not answer,
 * or one the AI could not read at all. An answered question stays out — the
 * AI's answer IS the attention; a reply from the reporter brings it back.
 */
const openHelpNotifications = cache(async (): Promise<Notification[]> => {
  const rows = await db.helpReport.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    include: { reporter: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: "help_open",
    message: `${r.reporter.name ?? r.reporter.email} asked for help: ${r.title ?? (r.description.slice(0, 60) || "voice note")}`,
    openedAt: r.createdAt.toISOString(),
    closedAt: null,
    closedReason: null,
    acknowledgedAt: null,
    raiseCount: 1,
    subject: r.title ?? "Help request",
    societyName: null,
    circuitLabel: null,
    ownerLabel: null,
    href: `/admin/help/${r.id}`,
  }));
});

/**
 * Open "the society agreed to finish these lights itself" handoffs
 * (2026-10-06) — visible to ops so a society that never gets around to it
 * isn't forgotten. No acknowledge act: the society marking it done IS the
 * resolution, same shape as the ticket feed.
 */
const openReplacementFollowUpNotifications = cache(async (): Promise<Notification[]> => {
  const rows = await db.demoReplacementFollowUp.findMany({
    where: { plan: "society_completes", completedAt: null, voidedAt: null },
    orderBy: { raisedAt: "asc" },
    include: { circuit: { select: { id: true, societyId: true, location: true, lightType: true, society: { select: { name: true } } } } },
  });
  return rows.map((f) => {
    const remaining = Array.isArray(f.remaining) ? (f.remaining as { remainingCount?: number }[]) : [];
    const total = remaining.reduce((n, l) => n + (Number(l.remainingCount) || 0), 0);
    const label = circuitLabelOf(f.circuit.location, f.circuit.lightType);
    return {
      id: f.id,
      kind: "replacement_followup_open",
      message: `${f.circuit.society.name} · ${label}: ${total} light${total === 1 ? "" : "s"} still waiting on the society.`,
      openedAt: f.raisedAt.toISOString(),
      closedAt: null,
      closedReason: null,
      acknowledgedAt: null,
      raiseCount: 1,
      subject: label,
      societyName: f.circuit.society.name,
      circuitLabel: label,
      ownerLabel: null,
      href: `/admin/societies/${f.circuit.societyId}/circuits/${f.circuit.id}`,
    };
  });
});

function toNotification(a: Row): Notification {
  const circuit = a.circuit ?? a.meter?.circuit ?? null;
  const owner = a.meter?.owner ?? a.circuit?.meterDevice?.owner ?? null;
  return {
    id: a.id,
    kind: a.kind,
    message: a.message,
    openedAt: a.openedAt.toISOString(),
    closedAt: a.closedAt?.toISOString() ?? null,
    closedReason: a.closedReason,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    raiseCount: a.raiseCount,
    subject: a.meter?.name ?? (circuit ? circuitLabelOf(circuit.location, circuit.lightType) : "Unknown"),
    societyName: a.meter?.society?.name ?? a.circuit?.society?.name ?? null,
    circuitLabel: circuit ? circuitLabelOf(circuit.location, circuit.lightType) : null,
    ownerLabel: owner ? (owner.name ?? owner.email) : null,
    // A commercial shortfall belongs on the monitoring screen where the
    // figures are; a hardware fault belongs on the meter. A demo still mid-
    // window belongs on the circuit's own page, where the demo steps and
    // readings live — live-monitoring is for AFTER commissioning.
    href: DEMO_ALERT_KINDS.has(a.kind) && circuit
      ? `/admin/societies/${circuit.societyId}/circuits/${circuit.id}`
      : a.kind === "savings_out_of_band" && circuit
        ? `/admin/live-monitoring/${circuit.id}`
        : a.meter
          ? `/admin/meters/${a.meter.id}`
          : circuit
            ? `/admin/live-monitoring/${circuit.id}`
            : "/admin/notifications",
  };
}

const DEMO_ALERT_KINDS = new Set(["demo_pre_variance", "demo_post_variance", "demo_readings_missing"]);

/**
 * How many need attention right now — the number on the bell.
 *
 * Counts OPEN and UNACKNOWLEDGED only. An acknowledged alert stays open (the
 * meter is still down) but stops nagging: the badge is "how much is
 * unattended", not "how much is wrong", or it never returns to zero and
 * stops meaning anything.
 */
export const unreadNotificationCount = cache(async (): Promise<number> => {
  // Counted off the feed itself, so the badge and every surface that renders
  // the feed are arithmetically the same answer rather than two lists kept in
  // step by hand. `openNotifications` is cache()-memoized, so a page that
  // also renders the list pays for this once.
  const open = await openNotifications();
  return open.filter((n) => n.acknowledgedAt === null).length;
});

/** Everything still open, worst-first by age. */
export const openNotifications = cache(async (): Promise<Notification[]> => {
  const [alertRows, invoiceNotifications, inspectionNotifications, ticketNotifications, helpNotifications, followUpNotifications] =
    await Promise.all([
      db.meterAlert.findMany({ where: { closedAt: null }, orderBy: { openedAt: "asc" }, include }),
      openInvoiceNotifications(),
      openInspectionOverdueNotifications(),
      openTicketNotifications(),
      openHelpNotifications(),
      openReplacementFollowUpNotifications(),
    ]);
  return [
    ...alertRows.map(toNotification),
    ...invoiceNotifications,
    ...inspectionNotifications,
    ...ticketNotifications,
    ...helpNotifications,
    ...followUpNotifications,
  ].sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
});

/** The history — resolved alerts, most recently closed first. */
export async function pastNotifications(limit = 50): Promise<Notification[]> {
  const rows = await db.meterAlert.findMany({
    where: { closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    take: limit,
    include,
  });
  return rows.map(toNotification);
}
