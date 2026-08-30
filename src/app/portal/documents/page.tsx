import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, EmptyState, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { publicS3Url } from "@/lib/s3";
import { monthName } from "../portal-widgets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

/**
 * The society's own paper, ready to download (customer-portal revamp,
 * 2026-08-29). Everything here is a StoredDocument row — the filing system
 * the back office already uses — filtered to the RESIDENT-FACING types.
 * The internal ones (meter exports, KYC files) are deliberately absent:
 * a GST certificate is the society's own document, but it was collected for
 * compliance, not published to the committee, and showing it here would be a
 * decision nobody made.
 *
 * Downloads are the stored object's public URL — the same public-read
 * Documents/ policy every admin surface uses (the user's standing S3 call).
 */
const VISIBLE: Record<string, { label: string; tone: ChipTone }> = {
  agreement: { label: "Agreement", tone: "info" },
  savingsReport: { label: "Savings report", tone: "info" },
  preDemoReport: { label: "Demo report (before)", tone: "neu" },
  postDemoReport: { label: "Demo report (after)", tone: "neu" },
  inspectionReport: { label: "Inspection report", tone: "ok" },
};

export default async function PortalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const societyId = viewer.societyId;
  const { type } = await searchParams;
  const activeType = type && VISIBLE[type] ? type : null;

  const docs = await db.storedDocument.findMany({
    where: { societyId, voidedAt: null, docType: { in: Object.keys(VISIBLE) } },
    orderBy: [{ period: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      docType: true,
      period: true,
      version: true,
      fileName: true,
      byteSize: true,
      s3Key: true,
      uploadedAt: true,
    },
  });

  // Only the LATEST version of each slot: superseded versions are the back
  // office's history, not the society's downloads list.
  const latest = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const slot = `${d.docType}|${d.period}`;
    if (!latest.has(slot)) latest.set(slot, d);
  }
  const all = [...latest.values()];
  const typesPresent = [...new Set(all.map((d) => d.docType))];
  const shown = activeType ? all.filter((d) => d.docType === activeType) : all;

  const agreement = all.find((d) => d.docType === "agreement");
  const rest = shown.filter((d) => d.id !== agreement?.id);
  const byPeriod = new Map<string, typeof rest>();
  for (const d of rest) {
    if (!byPeriod.has(d.period)) byPeriod.set(d.period, []);
    byPeriod.get(d.period)!.push(d);
  }

  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Everything on record for your society, ready to download."
      />

      {all.length === 0 ? (
        <EmptyState title="No documents filed yet">
          Savings reports, your agreement and inspection reports appear here as FirsThing files
          them.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Link
              href="/portal/documents"
              className="chip"
              style={
                activeType === null
                  ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                  : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
              }
            >
              All
            </Link>
            {typesPresent.map((t) => (
              <Link
                key={t}
                href={`/portal/documents?type=${t}`}
                className="chip"
                style={
                  activeType === t
                    ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                    : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
                }
              >
                {VISIBLE[t].label}
              </Link>
            ))}
          </div>

          {agreement && (activeType === null || activeType === "agreement") && (
            <Card className="mb-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">Signed agreement — the copy on record</p>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                    {agreement.fileName} · {kb(agreement.byteSize)}
                  </p>
                </div>
                <a
                  href={publicS3Url(agreement.s3Key)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  Download
                </a>
              </div>
            </Card>
          )}

          {[...byPeriod.entries()].map(([period, items]) => (
            <Card key={period} className="mb-5 p-5">
              <p className="lbl mb-2">{monthName(period)}</p>
              <div className="flex flex-col">
                {items.map((d, i) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    style={i < items.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <StatusChip tone={VISIBLE[d.docType].tone}>{VISIBLE[d.docType].label}</StatusChip>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold" title={d.fileName}>
                          {d.fileName}
                        </p>
                        <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          filed {d.uploadedAt.toISOString().slice(0, 10)} · {kb(d.byteSize)}
                          {d.version > 1 ? ` · v${d.version}` : ""}
                        </p>
                      </div>
                    </div>
                    <a href={publicS3Url(d.s3Key)} target="_blank" rel="noreferrer" className="btn-secondary">
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
