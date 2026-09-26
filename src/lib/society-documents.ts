/**
 * Everything a society can see and download, in ONE place (2026-09-26,
 * user-asked). The portal's Documents page lists it for the society; the
 * back office's society page lists the same set, so what FirsThing sees as
 * "shared with the society" and what the society actually sees cannot drift.
 *
 * Four sources:
 *   - filed documents (StoredDocument) of the resident-facing types — the
 *     internal ones (meter exports, KYC files) are deliberately absent, and
 *     filed invoices appear only once released to the society;
 *   - monthly savings reports FirsThing has published (latest version of each
 *     circuit-month);
 *   - demo savings reports shared with the society (latest version per deal);
 *   - finalised inspections.
 */
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { publicS3Url } from "@/lib/s3";
import { dealLabel } from "@/lib/deal-scope";
import type { ChipTone } from "@/components/ui";

export const SOCIETY_DOC_TYPES: Record<string, { label: string; tone: ChipTone }> = {
  agreement: { label: "Agreement", tone: "info" },
  demoReport: { label: "Demo savings report", tone: "info" },
  savingsReport: { label: "Savings report", tone: "info" },
  preDemoReport: { label: "Demo report (before)", tone: "neu" },
  postDemoReport: { label: "Demo report (after)", tone: "neu" },
  inspectionReport: { label: "Inspection report", tone: "ok" },
  invoiceCopy: { label: "Invoice", tone: "warn" },
  nonServiceInvoice: { label: "Invoice (other charges)", tone: "warn" },
};
/** Types that reach the society only once FirsThing has released them. */
const RELEASE_GATED = ["invoiceCopy", "nonServiceInvoice"];

export type SocietyDocRow = {
  id: string;
  docType: string;
  /** YYYY-MM */
  period: string;
  title: string;
  detail: string;
  /** Where the society opens it. */
  portalHref: string;
  /** Where the back office opens it. */
  adminHref: string;
  /** A file download (opens in a new tab) rather than a page in the app. */
  external: boolean;
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const month = (d: Date) => d.toISOString().slice(0, 7);

export async function societyDocuments(societyId: string): Promise<{ agreement: SocietyDocRow | null; rows: SocietyDocRow[] }> {
  const [docs, published, demoReports, inspections] = await Promise.all([
    db.storedDocument.findMany({
      where: {
        societyId,
        voidedAt: null,
        OR: [
          { docType: { in: Object.keys(SOCIETY_DOC_TYPES).filter((t) => !RELEASE_GATED.includes(t)) } },
          { docType: { in: RELEASE_GATED }, releasedToSocietyAt: { not: null } },
        ],
      },
      orderBy: [{ period: "desc" }, { uploadedAt: "desc" }],
      select: { id: true, docType: true, period: true, version: true, fileName: true, byteSize: true, s3Key: true, uploadedAt: true },
    }),
    db.publishedSavingsReport.findMany({
      where: { societyId, voidedAt: null },
      orderBy: [{ period: "desc" }, { version: "desc" }],
      select: { id: true, circuitId: true, period: true, version: true, publishedAt: true, snapshot: true },
    }),
    db.demoReport.findMany({
      where: { status: "shared", pipeline: { societyId } },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        sharedAt: true,
        generatedAt: true,
        measuredSavingsPct: true,
        pipelineId: true,
        pipeline: { select: { serviceLine: true, dealScope: true } },
      },
    }),
    db.inspection.findMany({
      where: { societyId, voidedAt: null, totalLightsChecked: { not: null } },
      orderBy: { inspectedAt: "desc" },
      select: { id: true, period: true, area: true, inspectedAt: true, inspectorName: true },
    }),
  ]);

  // Only the LATEST version of each slot: superseded versions are the back
  // office's own history, not the society's downloads list.
  const latestDoc = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (!latestDoc.has(`${d.docType}|${d.period}`)) latestDoc.set(`${d.docType}|${d.period}`, d);
  const latestPublished = new Map<string, (typeof published)[number]>();
  for (const r of published) if (!latestPublished.has(`${r.circuitId}|${r.period}`)) latestPublished.set(`${r.circuitId}|${r.period}`, r);
  const latestDemo = new Map<string, (typeof demoReports)[number]>();
  for (const r of demoReports) if (!latestDemo.has(r.pipelineId)) latestDemo.set(r.pipelineId, r);
  const deals = new Set(demoReports.map((r) => r.pipelineId)).size;

  const stored = [...latestDoc.values()].map(
    (d): SocietyDocRow => ({
      id: d.id,
      docType: d.docType,
      period: d.period,
      title: d.fileName,
      detail: `filed ${formatDate(d.uploadedAt)} · ${kb(d.byteSize)}${d.version > 1 ? ` · v${d.version}` : ""}`,
      portalHref: publicS3Url(d.s3Key),
      adminHref: publicS3Url(d.s3Key),
      external: true,
    }),
  );
  const agreement = stored.find((d) => d.docType === "agreement") ?? null;

  const rows: SocietyDocRow[] = [
    ...stored.filter((d) => d.id !== agreement?.id),
    ...[...latestPublished.values()].map((r): SocietyDocRow => {
      const snap = r.snapshot as { circuitLabel?: string };
      return {
        id: r.id,
        docType: "savingsReport",
        period: r.period,
        title: `Monthly savings report — ${snap.circuitLabel ?? "circuit"}`,
        detail: `published ${formatDate(r.publishedAt)}${r.version > 1 ? ` · v${r.version}` : ""}`,
        portalHref: `/portal/reports/savings/${r.id}`,
        adminHref: `/admin/societies/${societyId}/circuits/${r.circuitId}/reports/monthly?month=${r.period}`,
        external: false,
      };
    }),
    ...[...latestDemo.values()].map(
      (r): SocietyDocRow => ({
        id: r.id,
        docType: "demoReport",
        period: month(r.sharedAt ?? r.generatedAt),
        title: `Demo savings report${deals > 1 ? ` — ${dealLabel(r.pipeline.serviceLine, r.pipeline.dealScope)}` : ""}`,
        detail: `shared ${formatDate(r.sharedAt ?? r.generatedAt)} · ${r.measuredSavingsPct.toFixed(2)}% saving${r.version > 1 ? ` · v${r.version}` : ""}`,
        portalHref: `/portal/reports/demo/${r.id}`,
        adminHref: `/admin/pipeline/${r.pipelineId}/report`,
        external: false,
      }),
    ),
    ...inspections.map(
      (i): SocietyDocRow => ({
        id: i.id,
        docType: "inspectionReport",
        period: i.period,
        title: `Inspection report — ${i.area || "whole society"}`,
        detail: `inspected ${formatDate(i.inspectedAt)} by ${i.inspectorName}`,
        portalHref: `/portal/inspection/${i.id}`,
        adminHref: `/admin/inspections/${i.id}`,
        external: false,
      }),
    ),
  ].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

  return { agreement, rows };
}
