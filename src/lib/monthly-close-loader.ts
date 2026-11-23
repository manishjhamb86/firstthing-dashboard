import { db } from "@/lib/db";
import { circuitName } from "@/lib/circuit-label";
import { circuitMonitoringStart } from "@/lib/monitoring-projection";
import { periodBounds } from "@/lib/invoice-month-loader";
import { loadSocietyStandings } from "@/lib/society-standing-loader";
import { closeStage, emailReady, reportState, type BillState, type CloseStage, type ReportState } from "@/lib/monthly-close";

/**
 * The monthly close desk's reads (2026-11-18). One loader for the list and
 * the society page, so a society reads the same state on both.
 *
 * A circuit "has a report" for the month when it holds a monitoring day in
 * it on or after its monitoring start — exactly the rule the circuit's own
 * monthly report page lists months by (report-data.ts monthsWithData).
 * The bill is the society's live invoice-first month: released, submitted
 * and awaiting release, an invoice fetched but not yet submitted, or nothing.
 */

export type CloseCircuit = { id: string; label: string; publishedId: string | null; publishedVersion: number | null };

export type CloseRow = {
  societyId: string;
  name: string;
  location: string;
  circuits: CloseCircuit[];
  report: ReportState;
  bill: BillState;
  intakeId: string | null;
  calculationId: string | null;
  invoice: { id: string; number: string; amount: number; dueDate: Date } | null;
  emailedAt: Date | null;
  emailedTo: number;
  emailReady: boolean;
  stage: CloseStage;
};

async function circuitsWithMonth(circuits: { id: string }[], period: string): Promise<Set<string>> {
  if (circuits.length === 0) return new Set();
  const { from, to } = periodBounds(period);
  const rows = await db.meterReading.findMany({
    where: { circuitId: { in: circuits.map((c) => c.id) }, date: { gte: from, lt: to } },
    select: { circuitId: true, date: true },
  });
  const latestByCircuit = new Map<string, Date>();
  for (const r of rows) {
    const cur = latestByCircuit.get(r.circuitId);
    if (!cur || r.date > cur) latestByCircuit.set(r.circuitId, r.date);
  }
  const out = new Set<string>();
  await Promise.all(
    [...latestByCircuit.entries()].map(async ([id, last]) => {
      const start = await circuitMonitoringStart(id);
      if (start === null || last.getTime() >= start.getTime()) out.add(id);
    }),
  );
  return out;
}

export async function loadCloseRows(period: string, onlySocietyId?: string): Promise<CloseRow[]> {
  const standings = await loadSocietyStandings();
  const ids = [...standings.entries()].filter(([, s]) => s.standing === "active" || s.standing === "suspended").map(([id]) => id);
  const societyIds = onlySocietyId ? [onlySocietyId] : ids;
  if (societyIds.length === 0) return [];

  const [societies, published, intakes, calcs, emails] = await Promise.all([
    db.society.findMany({
      where: { id: { in: societyIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        location: true,
        circuits: { where: { voidedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, location: true, lightType: true, name: true } },
      },
    }),
    db.publishedSavingsReport.findMany({
      where: { societyId: { in: societyIds }, period, voidedAt: null },
      orderBy: { version: "desc" },
      select: { id: true, circuitId: true, version: true },
    }),
    db.invoiceIntake.findMany({
      where: {
        societyId: { in: societyIds },
        period,
        discardedAt: null,
        retailInvoiceId: null,
        filedAsDocumentId: null,
        status: { notIn: ["submitted", "discarded", "refused_duplicate"] },
      },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, societyId: true },
    }),
    db.monthlyCalculation.findMany({
      where: { societyId: { in: societyIds }, period, status: { in: ["submitted", "released", "calculated"] } },
      orderBy: { version: "desc" },
      select: {
        id: true,
        societyId: true,
        status: true,
        releasedAt: true,
        invoices: { where: { voidedAt: null }, select: { id: true, number: true, amount: true, dueDate: true } },
      },
    }),
    db.monthlyCloseEmail.findMany({
      where: { societyId: { in: societyIds }, period },
      orderBy: { sentAt: "desc" },
      select: { societyId: true, sentAt: true, recipients: true },
    }),
  ]);

  return Promise.all(
    societies.map(async (s) => {
      const withMonth = await circuitsWithMonth(s.circuits, period);
      const circuits: CloseCircuit[] = s.circuits
        .filter((c) => withMonth.has(c.id))
        .map((c) => {
          const p = published.find((r) => r.circuitId === c.id) ?? null;
          return { id: c.id, label: circuitName(c), publishedId: p?.id ?? null, publishedVersion: p?.version ?? null };
        });
      const report = reportState(circuits.length, circuits.filter((c) => c.publishedId).length);
      const calc = calcs.find((c) => c.societyId === s.id) ?? null;
      const intake = intakes.find((i) => i.societyId === s.id) ?? null;
      const invoice = calc?.invoices[0] ?? null;
      const bill: BillState =
        calc && (calc.status === "released" || calc.releasedAt) ? "released"
        : calc && invoice ? "awaiting_release"
        : intake ? "to_review"
        : "not_fetched";
      const email = emails.find((e) => e.societyId === s.id) ?? null;
      return {
        societyId: s.id,
        name: s.name,
        location: s.location,
        circuits,
        report,
        bill,
        intakeId: intake?.id ?? null,
        calculationId: calc?.id ?? null,
        invoice,
        emailedAt: email?.sentAt ?? null,
        emailedTo: email?.recipients.length ?? 0,
        emailReady: emailReady(report, bill),
        stage: closeStage({ report, bill, emailed: email !== null }),
      };
    }),
  );
}

/** Who the society's email can go to: current members of its register with an email address. */
export async function closeRecipients(societyId: string) {
  const members = await db.societyMember.findMany({
    where: { societyId, endedOn: null, email: { not: null } },
    orderBy: [{ primaryContact: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, position: { select: { name: true } } },
  });
  const seen = new Set<string>();
  return members
    .filter((m) => m.email && m.email.trim())
    .filter((m) => {
      const k = m.email!.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((m) => ({ id: m.id, name: m.name, email: m.email!.trim(), role: m.position.name }));
}
