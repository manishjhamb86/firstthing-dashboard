import { circuitName } from "@/lib/circuit-label";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { DOCUMENT_TYPES } from "@/lib/document-catalog";
import { formatDateTime, istDayHeading, istTime } from "@/lib/format-date";
import { DocumentUploadClient } from "./upload-client";
import { RecentlyFiled } from "./recently-filed";

export const dynamic = "force-dynamic";

/** The start of the "this week" count — a request-time instant, outside render. */
function sevenDaysAgo(): Date {
  return new Date(new Date().getTime() - 7 * 86_400_000);
}
export const metadata = { title: "Documents" };

/**
 * One place to file any document, whatever kind it is. The type is chosen
 * from the catalog, and the catalog decides what a valid file looks like,
 * what it has to be attached to, and what happens to it — so a document
 * cannot be accepted here under rules its own screen would not apply.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; societyId?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  // A prompt elsewhere ("Upload GST" on the society page) lands here with
  // the type and society already chosen.
  const sp = await searchParams;

  const weekAgo = sevenDaysAgo();
  const [societies, pipelines, circuits, recent, filedThisWeek, withdrawnThisWeek] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.pipeline.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, serviceLine: true, societyId: true, society: { select: { name: true } } },
    }),
    db.circuit.findMany({
      where: { voidedAt: null },
      orderBy: [{ societyId: "asc" }],
      select: { id: true, societyId: true, location: true, lightType: true, name: true, society: { select: { name: true } } },
    }),
    db.storedDocument.findMany({
      // Every version, newest slot first — a withdrawn one still shows, or
      // "withdrawn" would be indistinguishable from "never uploaded".
      orderBy: [{ uploadedAt: "desc" }],
      take: 40,
      include: { society: { select: { name: true } }, uploadedBy: { select: { email: true, name: true } } },
    }),
    db.storedDocument.count({ where: { uploadedAt: { gte: weekAgo } } }),
    db.storedDocument.count({ where: { voidedAt: { gte: weekAgo } } }),
  ]);

  const label = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id)?.label ?? id;

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="File a document against a society. The system checks the file really is what you say before accepting it."
        chip={
          <span className="flex flex-wrap gap-2 text-[13px] font-normal" style={{ color: "var(--text-muted)" }}>
            <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <b style={{ color: "var(--text)" }}>{filedThisWeek}</b> filed this week
            </span>
            {withdrawnThisWeek > 0 && (
              <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <b style={{ color: "var(--text)" }}>{withdrawnThisWeek}</b> withdrawn
              </span>
            )}
          </span>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0" style={{ flex: "999 1 520px" }}>
          <DocumentUploadClient
            canUpload={Boolean(actor?.permissions.includes("manage_pipeline"))}
            initialTypeId={DOCUMENT_TYPES.some((t) => t.id === sp.type) ? sp.type : undefined}
            initialSocietyId={sp.societyId}
            types={DOCUMENT_TYPES.map((t) => ({
              id: t.id,
              label: t.label,
              operation: t.operation,
              context: t.context,
              needsPeriod: t.needsPeriod,
              periodHint: t.periodHint,
              issuedAt: Boolean(t.issuedAt),
              acceptedExtensions: t.acceptedExtensions,
              maxMb: Math.round(t.maxBytes / (1024 * 1024)),
              uploadHere: t.uploadHere,
              handledAt: t.handledAt ?? null,
            }))}
            societies={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
            pipelines={pipelines.map((p) => ({
              id: p.id,
              societyId: p.societyId,
              label: String(p.serviceLine),
            }))}
            circuits={circuits.map((c) => ({
              id: c.id,
              societyId: c.societyId,
              label: circuitName(c),
            }))}
          />
        </div>
        <div className="min-w-0" style={{ flex: "1 1 340px" }}>
          <RecentlyFiled
            rows={recent.map((d) => ({
              id: d.id,
              docType: d.docType,
              label: label(d.docType),
              version: d.version,
              society: d.society.name,
              when: d.issuedAt ? formatDateTime(d.issuedAt) : d.period,
              fileName: d.fileName,
              day: istDayHeading(d.uploadedAt),
              time: istTime(d.uploadedAt),
              by: d.uploadedBy.name ?? d.uploadedBy.email,
              withdrawn: d.voidedAt ? { reason: d.voidReason } : null,
            }))}
          />
        </div>
      </div>
    </>
  );
}
