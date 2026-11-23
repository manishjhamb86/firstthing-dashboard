import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { teamMeta } from "@/lib/admin-teams";
import { PURPOSE_LABEL } from "@/lib/stock-workflow-labels";
import { loadOpenSlips, type OpenSlip } from "@/lib/stock-workflow-loader";
import { requireInventoryPage } from "../access";
import { SlipActions } from "./slip-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Who holds what" };

const STATE: Record<string, { label: string; tone: ChipTone }> = {
  overdue: { label: "Overdue", tone: "warn" },
  due_soon: { label: "Due soon", tone: "info" },
  on_time: { label: "On time", tone: "ok" },
  closed: { label: "Closed", tone: "neu" },
};
const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : ""}`;
const itemsLine = (s: OpenSlip) =>
  s.lines
    .filter((l) => l.held > 0)
    .map((l) => `${fmt(l.held, l.item.unit)} ${l.item.name}`)
    .join(" · ");

/**
 * Stock issued to employees and not yet installed or returned (2026-11-23).
 * Overdue means past its expected installation date with something still held.
 */
export default async function CustodyPage({ searchParams }: { searchParams: Promise<{ slip?: string; view?: string }> }) {
  await requireInventoryPage();
  const { slip: slipId, view } = await searchParams;
  const [slips, offices, monthReturns, costs] = await Promise.all([
    loadOpenSlips(),
    db.stockLocation.findMany({ where: { kind: "office", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.stockMovement.findMany({
      where: { kind: "return_to_office", issueSlipId: { not: null }, on: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } },
      select: { quantity: true, unitId: true, unit: { select: { status: true } } },
    }),
    db.inventoryBatch.findMany({ where: { unitCost: { not: null } }, orderBy: { receivedOn: "desc" }, select: { itemTypeId: true, unitCost: true } }),
  ]);
  const lastCost = new Map<string, number>();
  for (const b of costs) if (!lastCost.has(b.itemTypeId)) lastCost.set(b.itemTypeId, b.unitCost!);

  const heldItems = slips.reduce((s, x) => s + x.held, 0);
  const people = new Set(slips.map((s) => s.employeeId)).size;
  const value = slips.reduce((s, x) => s + x.lines.reduce((t, l) => t + l.held * (lastCost.get(l.itemTypeId) ?? 0), 0), 0);
  const overdue = slips.filter((s) => s.state === "overdue");
  const overdueItems = overdue.reduce((s, x) => s + x.held, 0);
  const returned = monthReturns.reduce((s, m) => s + m.quantity, 0);
  const returnedFaulty = monthReturns.filter((m) => m.unit?.status === "faulty").length;

  const shown = view === "overdue" ? overdue : view === "soon" ? slips.filter((s) => s.state === "due_soon") : slips;
  const open = slips.find((s) => s.id === slipId) ?? null;

  return (
    <>
      <PageHeader
        title="Who holds what"
        subtitle="Stock issued to employees and not yet installed or returned. Overdue means past its expected installation date."
        action={
          <Link href="/admin/inventory/issue" className="btn-primary btn-sm">
            Issue stock
          </Link>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="lbl">With employees</p>
          <p className="num text-[22px] font-bold">{heldItems.toLocaleString("en-IN")} items</p>
          <p className="text-[12.5px] text-[var(--text-muted)]">
            across {people} {people === 1 ? "person" : "people"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="lbl">Value at cost</p>
          <p className="num text-[22px] font-bold">₹{Math.round(value).toLocaleString("en-IN")}</p>
          <p className="text-[12.5px] text-[var(--text-muted)]">at last cost, before GST</p>
        </Card>
        <Card className="p-4" >
          <p className="lbl" style={{ color: overdue.length ? "var(--warn-fg)" : undefined }}>
            Overdue
          </p>
          <p className="num text-[22px] font-bold" style={{ color: overdue.length ? "var(--warn-fg)" : undefined }}>
            {overdueItems.toLocaleString("en-IN")} items
          </p>
          <p className="text-[12.5px] text-[var(--text-muted)]">
            {overdue.length} slip{overdue.length === 1 ? "" : "s"}
            {overdue.length ? ` · oldest ${Math.max(...overdue.map((s) => s.daysLate))} days` : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="lbl">Returned this month</p>
          <p className="num text-[22px] font-bold">{returned.toLocaleString("en-IN")} items</p>
          <p className="text-[12.5px] text-[var(--text-muted)]">{returnedFaulty} marked faulty</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: undefined, label: `Everyone · ${slips.length}` },
          { key: "overdue", label: `Overdue · ${overdue.length}` },
          { key: "soon", label: `Due soon · ${slips.filter((s) => s.state === "due_soon").length}` },
        ].map((c) => (
          <Link key={c.label} href={c.key ? `/admin/inventory/custody?view=${c.key}` : "/admin/inventory/custody"} className="chip-filter" aria-current={view === c.key ? "page" : undefined}>
            {c.label}
          </Link>
        ))}
      </div>

      <Card className="mb-5 overflow-hidden">
        {shown.length === 0 ? (
          <div className="p-5">
            <EmptyState title={slips.length === 0 ? "Nobody is holding stock" : "Nothing in this view"}>Stock issued from an office shows here until it is installed or returned.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Slip</th>
                  <th>For society</th>
                  <th>Still held</th>
                  <th>Issued</th>
                  <th>Install by</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} style={{ background: s.id === open?.id ? "var(--accent-subtle)" : undefined }}>
                    <td>
                      <span className="font-semibold">{s.employee}</span>
                      {s.team && <span className="block text-xs text-[var(--text-muted)]">{teamMeta(s.team).label}</span>}
                    </td>
                    <td className="num">{s.code}</td>
                    <td>{s.society.name}</td>
                    <td className="min-w-[200px] whitespace-normal">{itemsLine(s)}</td>
                    <td className="num">{formatDate(s.issuedOn)}</td>
                    <td className="num">{formatDate(s.dueOn)}</td>
                    <td>
                      <StatusChip tone={STATE[s.state]!.tone}>{s.state === "overdue" ? `${s.daysLate} day${s.daysLate === 1 ? "" : "s"} late` : STATE[s.state]!.label}</StatusChip>
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/inventory/custody?slip=${s.id}${view ? `&view=${view}` : ""}`} className="font-semibold">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open ? (
        <Card className="p-5" id="slip">
          <p className="text-[15px] font-semibold">
            Slip <span className="num">{open.code}</span> · {open.employee} · {open.society.name}
          </p>
          <p className="mb-3 text-[13.5px] text-[var(--text-muted)]">
            {PURPOSE_LABEL[open.purpose]} · from {open.fromOffice} · issued {formatDate(open.issuedOn)} · install by {formatDate(open.dueOn)}
            {open.state === "overdue" ? ` · ${open.daysLate} days overdue` : ""}
            {open.note ? ` · ${open.note}` : ""}
          </p>
          <div className="mb-4 overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Issued</th>
                  <th className="text-right">Installed</th>
                  <th className="text-right">Returned</th>
                  <th className="text-right">Still held</th>
                </tr>
              </thead>
              <tbody>
                {open.lines.map((l) => (
                  <tr key={l.itemTypeId}>
                    <td>{l.item.name}</td>
                    <td className="num text-right">{fmt(l.issued, l.item.unit)}</td>
                    <td className="num text-right">{fmt(l.installed, l.item.unit)}</td>
                    <td className="num text-right">{fmt(l.returned, l.item.unit)}</td>
                    <td className="num text-right font-bold" style={{ color: l.held > 0 && open.state === "overdue" ? "var(--warn-fg)" : undefined }}>
                      {fmt(l.held, l.item.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SlipActions
            slip={{ id: open.id, dueOn: open.dueOn.toISOString().slice(0, 10), issuedOn: open.issuedOn.toISOString().slice(0, 10), fromOfficeId: open.fromOfficeId, employee: open.employee }}
            lines={open.lines.filter((l) => l.held > 0).map((l) => ({ itemTypeId: l.itemTypeId, name: l.item.name, unit: l.item.unit, tracking: l.item.tracking, held: l.held }))}
            offices={offices}
          />
        </Card>
      ) : (
        <Card className="p-5">
          <p className="mb-2 text-[15px] font-semibold">How a slip closes</p>
          <ul className="list-disc space-y-1.5 pl-4 text-[13.5px] text-[var(--text-muted)]">
            <li>The employee installs units at the society from their phone — those move to the society&apos;s site.</li>
            <li>Anything left is returned to an office, as unused or faulty with a reason.</li>
            <li>A slip closes when nothing is left on it.</li>
          </ul>
        </Card>
      )}
    </>
  );
}
