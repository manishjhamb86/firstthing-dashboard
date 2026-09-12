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
  warning: "is overdue and approaching suspension (CON-13)",
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

async function openInvoiceNotifications(): Promise<Notification[]> {
  const rows = await db.billingInvoice.findMany({
    where: { voidedAt: null, status: { in: ["overdue", "warning", "suspended"] } },
    include: invoiceInclude,
  });
  return rows.map(invoiceToNotification);
}

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
    // figures are; a hardware fault belongs on the meter.
    href:
      a.kind === "savings_out_of_band" && circuit
        ? `/admin/live-monitoring/${circuit.id}`
        : a.meter
          ? `/admin/meters/${a.meter.id}`
          : circuit
            ? `/admin/live-monitoring/${circuit.id}`
            : "/admin/notifications",
  };
}

/**
 * How many need attention right now — the number on the bell.
 *
 * Counts OPEN and UNACKNOWLEDGED only. An acknowledged alert stays open (the
 * meter is still down) but stops nagging: the badge is "how much is
 * unattended", not "how much is wrong", or it never returns to zero and
 * stops meaning anything.
 */
export const unreadNotificationCount = cache(async (): Promise<number> => {
  // Unattended alerts plus OPEN society requests (customer portal,
  // 2026-08-31) plus overdue/warning/suspended invoices (2026-09-12): none
  // of these three has a "somebody looked at it" state the way an
  // acknowledged meter alert does — following up IS the act, via
  // confirmPaymentStatus/recordPayment — so every one of them counts until
  // paid. In-progress tickets deliberately do not count — taking one up is
  // the attention the badge asks for.
  const [alerts, tickets, invoices] = await Promise.all([
    db.meterAlert.count({ where: { closedAt: null, acknowledgedAt: null } }),
    db.ticket.count({ where: { status: "open" } }),
    db.billingInvoice.count({ where: { voidedAt: null, status: { in: ["overdue", "warning", "suspended"] } } }),
  ]);
  return alerts + tickets + invoices;
});

/** Everything still open, worst-first by age. */
export const openNotifications = cache(async (): Promise<Notification[]> => {
  const [alertRows, invoiceNotifications] = await Promise.all([
    db.meterAlert.findMany({ where: { closedAt: null }, orderBy: { openedAt: "asc" }, include }),
    openInvoiceNotifications(),
  ]);
  return [...alertRows.map(toNotification), ...invoiceNotifications].sort(
    (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
  );
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
