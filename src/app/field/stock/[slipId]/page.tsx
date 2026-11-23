import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { circuitName } from "@/lib/circuit-label";
import { loadOpenSlips } from "@/lib/stock-workflow-loader";
import { requireFieldPage } from "../../access";
import { SlipForm } from "./slip-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

/**
 * One issue slip on the phone: install what is held at the slip's society,
 * or return it to an office (2026-11-23). Both are queued, so they work with
 * no signal; the unit codes held on the slip are on the page so a scan can be
 * checked before it is sent.
 */
export default async function SlipPage({ params, searchParams }: { params: Promise<{ slipId: string }>; searchParams: Promise<{ do?: string }> }) {
  const me = await requireFieldPage();
  const { slipId } = await params;
  const { do: mode } = await searchParams;
  const slip = (await loadOpenSlips({ employeeId: me.id })).find((s) => s.id === slipId);
  if (!slip) notFound();

  const [custody, offices, circuits] = await Promise.all([
    db.stockLocation.findUnique({ where: { adminUserId: me.id }, select: { id: true } }),
    db.stockLocation.findMany({ where: { kind: "office", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.circuit.findMany({ where: { societyId: slip.society.id, voidedAt: null }, select: { id: true, location: true, lightType: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const issued = await db.stockMovement.findMany({ where: { issueSlipId: slip.id, kind: "issue", unitId: { not: null } }, select: { unitId: true } });
  const units = custody
    ? await db.inventoryUnit.findMany({
        where: { id: { in: issued.map((m) => m.unitId!) }, locationId: custody.id, status: "in_stock" },
        select: { code: true, itemTypeId: true },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <>
      <header className="mb-5">
        <Link href="/field/stock" className="text-[14px] font-semibold">
          ← My stock
        </Link>
        <h1 className="mt-1 text-[22px] font-bold leading-tight">{slip.society.name}</h1>
        <p className="text-[var(--text-muted)]">
          Slip <span className="num">{slip.code}</span> · install by {formatDate(slip.dueOn)}
        </p>
      </header>
      <SlipForm
        slip={{ id: slip.id, code: slip.code, society: slip.society.name, issuedOn: slip.issuedOn.toISOString().slice(0, 10), fromOfficeId: slip.fromOfficeId }}
        lines={slip.lines.filter((l) => l.held > 0).map((l) => ({ itemTypeId: l.itemTypeId, name: l.item.name, unit: l.item.unit, tracking: l.item.tracking, held: l.held }))}
        units={units}
        offices={offices}
        circuits={circuits.map((c) => ({ id: c.id, label: circuitName(c) }))}
        initialMode={mode === "return" ? "return" : "install"}
      />
    </>
  );
}
