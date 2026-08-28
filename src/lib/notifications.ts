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
  meterId: string;
  meterName: string;
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
      circuit: { select: { location: true, lightType: true } },
      owner: { select: { name: true, email: true } },
    },
  },
} as const;

type Row = Awaited<ReturnType<typeof db.meterAlert.findMany<{ include: typeof include }>>>[number];

function toNotification(a: Row): Notification {
  return {
    id: a.id,
    kind: a.kind,
    message: a.message,
    openedAt: a.openedAt.toISOString(),
    closedAt: a.closedAt?.toISOString() ?? null,
    closedReason: a.closedReason,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    meterId: a.meter.id,
    meterName: a.meter.name,
    societyName: a.meter.society?.name ?? null,
    circuitLabel: a.meter.circuit ? circuitLabelOf(a.meter.circuit.location, a.meter.circuit.lightType) : null,
    ownerLabel: a.meter.owner ? (a.meter.owner.name ?? a.meter.owner.email) : null,
    href: `/admin/meters/${a.meter.id}`,
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
export const unreadNotificationCount = cache(async (): Promise<number> =>
  db.meterAlert.count({ where: { closedAt: null, acknowledgedAt: null } }),
);

/** Everything still open, worst-first by age. */
export const openNotifications = cache(async (): Promise<Notification[]> => {
  const rows = await db.meterAlert.findMany({
    where: { closedAt: null },
    orderBy: { openedAt: "asc" },
    include,
  });
  return rows.map(toNotification);
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
