import Link from "next/link";
import { BatchCost } from "./batch-cost";
import { notFound } from "next/navigation";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { MOVE_LABEL, STATUS_LABEL, balanceAt, type MoveKind, type UnitStatus } from "@/lib/inventory";
import { moveContext } from "@/lib/inventory-loader";
import { warrantyView } from "@/lib/inventory-warranty-view";
import { requireInventoryPage } from "../../access";
import { MoveQuantityForm } from "../../move-forms";
import { UnitsTable } from "./units-table";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventoryPage();
  const { id } = await params;
  const batch = await db.inventoryBatch.findUnique({
    where: { id },
    include: {
      itemType: true,
      purchase: { include: { supplier: true } },
      receivedAt: true,
      units: { orderBy: { code: "asc" }, include: { location: { select: { name: true } } } },
    },
  });
  if (!batch) notFound();
  const ctx = await moveContext();
  // History grouped in the database: 1,000 lights received is one line, however many rows it is.
  const grouped = await db.stockMovement.groupBy({
    by: ["kind", "on", "toLocationId", "reason"],
    where: { batchId: id },
    _count: { _all: true },
    _sum: { quantity: true },
    orderBy: { on: "desc" },
    take: 100,
  });
  const toNames = new Map(
    (await db.stockLocation.findMany({ where: { id: { in: grouped.map((g) => g.toLocationId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]),
  );
  const history = grouped.map((g) => ({
    kind: g.kind,
    on: g.on,
    count: g._count._all,
    quantity: g._sum.quantity ?? 0,
    to: g.toLocationId ? (toNames.get(g.toLocationId) ?? null) : null,
    reason: g.reason,
  }));
  const now = new Date();
  const serial = batch.itemType.tracking === "serial";

  let invoiceUrl: string | null = null;
  if (batch.purchase.invoiceS3Key) {
    try {
      invoiceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: batch.purchase.invoiceS3Key }), { expiresIn: 600 });
    } catch {
      invoiceUrl = null;
    }
  }

  // Quantity batches: what is where, from the ledger.
  const allMoves = serial ? [] : await db.stockMovement.findMany({ where: { batchId: batch.id }, select: { quantity: true, fromLocationId: true, toLocationId: true } });
  const locationIds = [...new Set(allMoves.flatMap((m) => [m.fromLocationId, m.toLocationId]).filter((x): x is string => !!x))];
  const locations = locationIds.length ? await db.stockLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true, kind: true } }) : [];
  const holdings = locations
    .map((l) => ({ locationId: l.id, name: `${l.name}${l.kind === "site" ? " (site)" : ""}`, balance: balanceAt(allMoves, l.id) }))
    .filter((h) => h.balance > 0);

  const warranty = (deployedOn: Date | null) =>
    warrantyView({ warrantyMonths: batch.warrantyMonths, basis: batch.warrantyBasis, purchaseDate: batch.purchase.invoiceDate, deployedOn, now });

  return (
    <>
      <PageHeader
        backHref="/admin/inventory"
        title={`Batch ${batch.code}`}
        chip={<StatusChip tone="info">{batch.itemType.name}</StatusChip>}
        subtitle={`${batch.quantity} ${batch.itemType.unit} from ${batch.purchase.supplier.name} · received ${formatDate(batch.receivedOn)} at ${batch.receivedAt.name}`}
        action={
          serial ? (
            <Link href={`/admin/inventory/batches/${batch.id}/labels`} className="btn-secondary btn-sm">
              Print labels
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <CardTitle>{serial ? `Units (${batch.units.length})` : "Where it is"}</CardTitle>
          {serial ? (
            <UnitsTable
              ctx={ctx}
              units={batch.units.map((u) => {
                const w = warranty(u.deployedOn);
                return {
                  code: u.code,
                  serialNumber: u.serialNumber,
                  status: u.status,
                  statusLabel: STATUS_LABEL[u.status as UnitStatus],
                  where: u.location?.name ?? "—",
                  warranty: w.label,
                  warrantyTone: w.tone,
                };
              })}
            />
          ) : (
            <div className="space-y-4">
              {holdings.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Nothing of this batch is at any location now.</p>
              ) : (
                <table className="tbl tbl-compact">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th className="text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.locationId}>
                        <td>{h.name}</td>
                        <td className="num text-right">
                          {h.balance} {batch.itemType.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <MoveQuantityForm batchId={batch.id} unit={batch.itemType.unit} holdings={holdings} ctx={ctx} />
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5 text-[13.5px]">
            <CardTitle>Batch details</CardTitle>
            <dl className="space-y-2">
              {([
                ["Supplier", batch.purchase.supplier.name],
                ["Supplier invoice", `${batch.purchase.invoiceNumber} · ${formatDate(batch.purchase.invoiceDate)}`],
                ["Supplier's lot", batch.supplierLot ?? "—"],
                ["Manufactured", batch.manufacturedOn ? formatDate(batch.manufacturedOn) : "—"],
                ["Cost", <BatchCost key="cost" batchId={batch.id} unitCost={batch.unitCost} unit={batch.itemType.unit} />],
                ["Value of the batch", batch.unitCost !== null ? `₹${(batch.unitCost * batch.quantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })} for ${batch.quantity.toLocaleString("en-IN")} received` : "—"],
                [
                  "Warranty",
                  batch.warrantyMonths
                    ? `${batch.warrantyMonths} months from ${batch.warrantyBasis === "install" ? "installation" : "the invoice date"}`
                    : "None stated",
                ],
              ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="lbl">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {invoiceUrl && (
              <a href={invoiceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-block">
                Open the supplier invoice
              </a>
            )}
          </Card>
          <Card className="p-5">
            <CardTitle>History</CardTitle>
            <ul className="max-h-[420px] space-y-2 overflow-auto text-[12.5px]">
              {history.map((m, i) => (
                <li key={i}>
                  <span className="font-semibold">{MOVE_LABEL[m.kind as MoveKind]}</span> · {formatDate(m.on)} · {m.count > 1 ? `${m.count} units` : `${m.quantity} ${batch.itemType.unit}`}
                  {m.to ? ` → ${m.to}` : ""}
                  {m.reason ? <span style={{ color: "var(--text-subtle)" }}> — {m.reason}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
