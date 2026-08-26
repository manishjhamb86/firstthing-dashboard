import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { DOCUMENT_TYPES } from "@/lib/document-catalog";
import { formatInstant } from "@/lib/format-date";
import { DocumentUploadClient } from "./upload-client";
import { WithdrawButton } from "./withdraw-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

/**
 * One place to file any document, whatever kind it is. The type is chosen
 * from the catalog, and the catalog decides what a valid file looks like,
 * what it has to be attached to, and what happens to it — so a document
 * cannot be accepted here under rules its own screen would not apply.
 */
export default async function DocumentsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();

  const [societies, pipelines, circuits, recent] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.pipeline.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, serviceLine: true, society: { select: { name: true } } },
    }),
    db.circuit.findMany({
      where: { voidedAt: null },
      orderBy: [{ societyId: "asc" }],
      select: { id: true, location: true, lightType: true, society: { select: { name: true } } },
    }),
    db.storedDocument.findMany({
      // Every version, newest slot first — a withdrawn one still shows, or
      // "withdrawn" would be indistinguishable from "never uploaded".
      orderBy: [{ uploadedAt: "desc" }],
      take: 40,
      include: { society: { select: { name: true } }, uploadedBy: { select: { email: true, name: true } } },
    }),
  ]);

  const label = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id)?.label ?? id;

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="File any document here — the system checks it really is what you say it is before accepting it."
      />

      <div className="grid max-w-[1180px] gap-5 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <DocumentUploadClient
            canUpload={Boolean(actor?.permissions.includes("manage_pipeline"))}
            types={DOCUMENT_TYPES.map((t) => ({
              id: t.id,
              label: t.label,
              operation: t.operation,
              context: t.context,
              needsPeriod: t.needsPeriod,
              acceptedExtensions: t.acceptedExtensions,
              maxMb: Math.round(t.maxBytes / (1024 * 1024)),
              uploadHere: t.uploadHere,
              handledAt: t.handledAt ?? null,
            }))}
            societies={societies.map((s) => ({ id: s.id, label: `${s.name} — ${s.location}` }))}
            pipelines={pipelines.map((p) => ({ id: p.id, label: `${p.society.name} — ${p.serviceLine}` }))}
            circuits={circuits.map((c) => ({
              id: c.id,
              label: `${c.society.name} — ${c.location ?? "Unnamed"} · ${c.lightType}`,
            }))}
          />
        </Card>

        <Card className="p-6 lg:col-span-5">
          <CardTitle>Recently filed</CardTitle>
          {recent.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nothing filed here yet. Documents that belong to a workflow — KYC files, meter exports —
              appear on that workflow&apos;s own screen instead.
            </p>
          ) : (
            <ul className="space-y-3 text-[13px]">
              {recent.map((d) => (
                <li key={d.id} className="border-b pb-2.5 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                  <p className="font-semibold" style={d.voidedAt ? { textDecoration: "line-through" } : undefined}>
                    {label(d.docType)} <span className="num">v{d.version}</span>
                  </p>
                  <p style={{ color: "var(--text-muted)" }}>
                    {d.society.name} · <span className="num">{d.period}</span>
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                    {d.fileName} · {formatInstant(d.uploadedAt)} · {d.uploadedBy.name ?? d.uploadedBy.email}
                  </p>
                  {d.voidedAt ? (
                    <p className="text-[11px]" style={{ color: "var(--warn-fg)" }}>
                      Withdrawn — {d.voidReason}
                    </p>
                  ) : (
                    <WithdrawButton documentId={d.id} version={d.version} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
