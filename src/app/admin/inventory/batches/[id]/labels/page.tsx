import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { labelLink } from "@/lib/inventory";

/**
 * The QR holds a link, so any phone's camera opens the unit (2026-09-25).
 * Labels are physical and outlive a deployment, so the link's base is its own
 * setting — set LABEL_BASE_URL to the production domain before printing
 * labels that go on lights; it falls back to this deployment's own address.
 */
const LABEL_BASE = process.env.LABEL_BASE_URL ?? process.env.AUTH_URL ?? "https://stage.firsthing.earth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { requireInventoryPage } from "../../../access";
import { PrintLabelsButton } from "./print-labels-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labels" };

const PAGE = 500;

/**
 * One sticker per unit (2026-09-25): a QR code of the unit's own code, the
 * code in text beneath it (readable if the QR is scuffed), the item and the
 * batch. Scanning or typing the code finds the exact unit. Printed with the
 * browser — plain paper or a sticker sheet; a range keeps a big batch printable.
 */
export default async function LabelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireInventoryPage();
  const { id } = await params;
  const sp = await searchParams;
  const batch = await db.inventoryBatch.findUnique({ where: { id }, include: { itemType: true } });
  if (!batch) notFound();
  const total = await db.inventoryUnit.count({ where: { batchId: id } });
  const from = Math.max(1, Number(sp.from) || 1);
  const to = Math.min(total, Number(sp.to) || Math.min(total, from + PAGE - 1));
  const units = await db.inventoryUnit.findMany({ where: { batchId: id }, orderBy: { code: "asc" }, skip: from - 1, take: Math.max(0, to - from + 1), select: { code: true } });
  const labels = await Promise.all(
    units.map(async (u) => ({ code: u.code, svg: await QRCode.toString(labelLink(LABEL_BASE, u.code), { type: "svg", errorCorrectionLevel: "M", margin: 0 }) })),
  );

  return (
    <>
      <div className="no-print">
        <PageHeader
          backHref={`/admin/inventory/batches/${id}`}
          title={`Labels — batch ${batch.code}`}
          subtitle={`${batch.itemType.name} · units ${from}–${to} of ${total}`}
          action={<PrintLabelsButton />}
        />
        {total > PAGE && (
          <p className="mb-4 flex flex-wrap gap-2 text-[13px]">
            {Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => {
              const a = i * PAGE + 1;
              const b = Math.min(total, a + PAGE - 1);
              return (
                <Link key={a} href={`?from=${a}&to=${b}`} className="chip" style={a === from ? { background: "var(--accent)", color: "var(--text-on-accent)" } : undefined}>
                  {a}–{b}
                </Link>
              );
            })}
          </p>
        )}
      </div>
      <div className="print-doc grid grid-cols-[repeat(auto-fill,minmax(38mm,1fr))] gap-[2mm]">
        {labels.map((l) => (
          <div key={l.code} className="flex items-center gap-[2mm] rounded-[1mm] border p-[1.5mm]" style={{ borderColor: "#999", breakInside: "avoid", color: "#000", background: "#fff" }}>
            <div className="h-[14mm] w-[14mm] shrink-0" dangerouslySetInnerHTML={{ __html: l.svg }} />
            <div className="min-w-0 leading-tight">
              <p className="font-mono text-[8pt] font-bold">{l.code}</p>
              <p className="truncate text-[6.5pt]">{batch.itemType.name}</p>
              <p className="text-[6.5pt]">
                FirsThing · {formatDate(batch.receivedOn)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
