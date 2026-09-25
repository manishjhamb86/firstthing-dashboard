import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, formatInstant } from "@/lib/format-date";
import { MOVE_LABEL, STATUS_LABEL, type MoveKind, type UnitStatus } from "@/lib/inventory";
import { moveContext } from "@/lib/inventory-loader";
import { warrantyView } from "@/lib/inventory-warranty-view";
import { circuitLabelOf } from "@/lib/circuit-label";
import { requireInventoryPage } from "../../access";
import { MoveUnitsForm } from "../../move-forms";

export const dynamic = "force-dynamic";

/** One unit's whole life — what a printed code resolves to. */
export default async function UnitPage({ params }: { params: Promise<{ code: string }> }) {
  await requireInventoryPage();
  const { code } = await params;
  const unit = await db.inventoryUnit.findUnique({
    where: { code: decodeURIComponent(code).toUpperCase() },
    include: {
      itemType: true,
      location: true,
      batch: { include: { purchase: { include: { supplier: true } }, receivedAt: true } },
      movements: { orderBy: [{ on: "asc" }, { recordedAt: "asc" }], include: { from: { select: { name: true } }, to: { select: { name: true } } } },
    },
  });
  if (!unit) notFound();
  const [ctx, circuit, people] = await Promise.all([
    moveContext(),
    unit.circuitId ? db.circuit.findUnique({ where: { id: unit.circuitId }, select: { location: true, lightType: true } }) : null,
    db.adminUser.findMany({ where: { id: { in: [...new Set(unit.movements.map((m) => m.recordedById))] } }, select: { id: true, name: true, email: true } }),
  ]);
  const who = new Map(people.map((p) => [p.id, p.name ?? p.email]));
  const w = warrantyView({
    warrantyMonths: unit.batch.warrantyMonths,
    basis: unit.batch.warrantyBasis,
    purchaseDate: unit.batch.purchase.invoiceDate,
    deployedOn: unit.deployedOn,
    now: new Date(),
  });
  const status = unit.status as UnitStatus;

  return (
    <>
      <PageHeader
        backHref={`/admin/inventory/batches/${unit.batchId}`}
        title={<span className="font-mono">{unit.code}</span>}
        chip={<StatusChip tone={status === "deployed" ? "ok" : status === "in_stock" ? "info" : status === "faulty" ? "warn" : "neu"}>{STATUS_LABEL[status]}</StatusChip>}
        subtitle={`${unit.itemType.name}${unit.location ? ` · at ${unit.location.name}` : ""}${circuit ? ` · ${circuitLabelOf(circuit.location, circuit.lightType)}` : ""}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle>Its life</CardTitle>
            <ol className="relative space-y-3 border-l pl-4" style={{ borderColor: "var(--border)" }}>
              {unit.movements.map((m) => (
                <li key={m.id} className="text-[13.5px]">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
                  <p>
                    <span className="font-semibold">{MOVE_LABEL[m.kind as MoveKind]}</span> · {formatDate(m.on)}
                    {m.from && m.to ? ` · ${m.from.name} → ${m.to.name}` : m.to ? ` · to ${m.to.name}` : m.from ? ` · from ${m.from.name}` : ""}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {m.reason ? `${m.reason} · ` : ""}recorded by {who.get(m.recordedById) ?? "—"}, {formatInstant(m.recordedAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <CardTitle>Record what happened</CardTitle>
            <MoveUnitsForm codes={[unit.code]} ctx={ctx} />
          </Card>
        </div>
        <Card className="p-5 text-[13.5px]">
          <CardTitle>Details</CardTitle>
          <dl className="space-y-2">
            {[
              ["Batch", <Link key="b" href={`/admin/inventory/batches/${unit.batchId}`} className="font-mono">{unit.batch.code}</Link>],
              ["Maker's serial", unit.serialNumber ?? "—"],
              ["Supplier", unit.batch.purchase.supplier.name],
              ["Supplier invoice", `${unit.batch.purchase.invoiceNumber} · ${formatDate(unit.batch.purchase.invoiceDate)}`],
              ["Supplier's lot", unit.batch.supplierLot ?? "—"],
              ["Received", `${formatDate(unit.batch.receivedOn)} at ${unit.batch.receivedAt.name}`],
              ["Deployed", unit.deployedOn ? formatDate(unit.deployedOn) : "—"],
              ["Warranty", <StatusChip key="w" tone={w.tone}>{w.label}</StatusChip>],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="lbl">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
