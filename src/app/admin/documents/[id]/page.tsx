import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { DOCUMENT_TYPES } from "@/lib/document-catalog";
import type { ExtractedDocument } from "@/lib/document-extract";
import { ExtractionReview } from "./review-client";

export const dynamic = "force-dynamic";

export default async function StoredDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  const { id } = await params;

  const doc = await db.storedDocument.findUnique({
    where: { id },
    include: {
      society: { select: { id: true, name: true, location: true } },
      uploadedBy: { select: { name: true, email: true } },
      extraction: true,
    },
  });
  if (!doc) notFound();

  const label = DOCUMENT_TYPES.find((t) => t.id === doc.docType)?.label ?? doc.docType;
  const circuits = await db.circuit.count({ where: { societyId: doc.societyId, voidedAt: null } });
  const proposed = (doc.extraction?.proposed ?? null) as ExtractedDocument | null;

  return (
    <>
      <PageHeader
        backHref="/admin/documents"
        title={label}
        subtitle={`${doc.society.name} · ${doc.period} · version ${doc.version}`}
        chip={
          doc.voidedAt ? (
            <StatusChip tone="warn">Withdrawn</StatusChip>
          ) : doc.extraction?.status === "confirmed" ? (
            <StatusChip tone="ok">Confirmed</StatusChip>
          ) : doc.extraction?.status === "proposed" ? (
            <StatusChip tone="warn">Needs review</StatusChip>
          ) : undefined
        }
      />

      <div className="grid max-w-[1180px] gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ExtractionReview
            documentId={doc.id}
            canRead={Boolean(actor?.permissions.includes("manage_pipeline"))}
            canCreate={Boolean(actor?.permissions.includes("manage_survey"))}
            modelError={doc.extraction?.modelError ?? null}
            proposed={proposed}
            alreadyUsed={doc.extraction?.status === "confirmed"}
            extractedAt={doc.extraction?.extractedAt?.toISOString() ?? null}
            societyName={doc.society.name}
            societyId={doc.societyId}
            existingCircuits={circuits}
          />
        </div>

        <Card className="p-6 lg:col-span-4">
          <CardTitle>The file</CardTitle>
          <dl className="text-[13px]">
            {(
              [
                ["Society", doc.society.name],
                ["Period", doc.period],
                ["Version", `v${doc.version}`],
                ["File", doc.fileName],
                ["Filed", `${formatInstant(doc.uploadedAt)} · ${doc.uploadedBy.name ?? doc.uploadedBy.email}`],
                ["Circuits on this society", String(circuits)],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 border-b py-2 last:border-b-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/admin/societies/${doc.societyId}/circuits`} className="btn-secondary mt-4 inline-block">
            Circuit registry →
          </Link>
        </Card>
      </div>
    </>
  );
}
