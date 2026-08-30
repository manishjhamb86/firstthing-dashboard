import { cache } from "react";
import { db } from "@/lib/db";

/**
 * The society's notification feed — DERIVED from rows of record, no table of
 * its own. The same call the admin notification centre made (2026-08-28):
 * alerts, filings and tickets already carry an owner, a time and an outcome,
 * so a shadow copy would only ever drift from them. What v1 therefore does
 * not have is per-member read state — "mark all read" needs a table keyed by
 * member, deferred and stated rather than faked with localStorage.
 *
 * Every source is scoped by the viewer's societyId (INV-05), which is this
 * function's only parameter — the boundary lives in the queries, not in what
 * a caller renders.
 */
export type PortalEvent = {
  id: string;
  at: Date;
  tone: "info" | "warn" | "ok" | "neu";
  title: string;
  detail: string;
  href: string | null;
};

const VISIBLE_DOC_LABEL: Record<string, string> = {
  savingsReport: "Savings report",
  preDemoReport: "Demo report (before)",
  postDemoReport: "Demo report (after)",
  inspectionReport: "Inspection report",
  agreement: "Agreement",
};

export const societyEvents = cache(async (societyId: string): Promise<PortalEvent[]> => {
  const [alerts, docs, tickets] = await Promise.all([
    db.meterAlert.findMany({
      where: {
        OR: [{ meter: { societyId } }, { circuit: { societyId } }],
      },
      orderBy: { openedAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        message: true,
        openedAt: true,
        closedAt: true,
        closedReason: true,
      },
    }),
    db.storedDocument.findMany({
      where: { societyId, voidedAt: null, docType: { in: Object.keys(VISIBLE_DOC_LABEL) } },
      orderBy: { uploadedAt: "desc" },
      take: 10,
      select: { id: true, docType: true, fileName: true, uploadedAt: true, period: true },
    }),
    db.ticket.findMany({
      where: { societyId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        resolutionNote: true,
      },
    }),
  ]);

  const events: PortalEvent[] = [];

  for (const a of alerts) {
    if (a.closedAt) {
      events.push({
        id: `alert-closed-${a.id}`,
        at: a.closedAt,
        tone: "ok",
        title: "Resolved — " + a.message.split(" — ")[0],
        detail: a.closedReason ?? "Back to normal.",
        href: null,
      });
    } else {
      events.push({
        id: `alert-${a.id}`,
        at: a.openedAt,
        tone: "warn",
        title: a.message,
        detail: "FirsThing has this on record and is on it.",
        href: null,
      });
    }
  }

  for (const d of docs) {
    events.push({
      id: `doc-${d.id}`,
      at: d.uploadedAt,
      tone: "info",
      title: `${VISIBLE_DOC_LABEL[d.docType] ?? "Document"} filed — ${d.period}`,
      detail: d.fileName,
      href: "/portal/documents",
    });
  }

  for (const t of tickets) {
    if (t.status === "resolved" && t.resolvedAt) {
      events.push({
        id: `ticket-res-${t.id}`,
        at: t.resolvedAt,
        tone: "ok",
        title: `Ticket resolved — ${t.subject}`,
        detail: t.resolutionNote ?? "Closed.",
        href: "/portal/support",
      });
    } else {
      events.push({
        id: `ticket-${t.id}`,
        at: t.createdAt,
        tone: "neu",
        title: `Ticket raised — ${t.subject}`,
        detail: t.status === "in_progress" ? "In progress." : "Open.",
        href: "/portal/support",
      });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 25);
});
