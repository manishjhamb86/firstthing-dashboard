import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { rupees } from "@/lib/inventory-holdings";
import { loadPlanning, loadPurchaseRequirement } from "@/lib/stock-workflow-loader";
import { requireInventoryPage } from "../../access";
import { PR_STATUS } from "../status";
import { PrActions, PrLinesEditor } from "./pr-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase requirement" };

const STEPS = [
  { key: "draft", title: "Draft", note: "Quantities can still change" },
  { key: "sent", title: "Sent to supplier", note: "Date and PO number recorded" },
  { key: "partly_received", title: "Partly received", note: "Each delivery is received as a batch" },
  { key: "received", title: "Received", note: "Closes when every line has arrived" },
];

export default async function PurchaseRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventoryPage();
  const { id } = await params;
  const pr = await loadPurchaseRequirement(id);
  if (!pr) notFound();
  const editable = pr.status === "draft";
  const [suppliers, plan] = await Promise.all([
    db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    editable ? loadPlanning() : Promise.resolve(null),
  ]);
  const here = new Set(pr.lines.map((l) => l.societyId));
  const addable = (plan?.societies ?? []).filter((s) => s.short > 0 && !here.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  const lastCost = plan?.lastCost ?? new Map<string, number>();
  const value = pr.lines.reduce((s, l) => s + l.quantity * (lastCost.get(l.itemTypeId) ?? 0), 0);
  const stepIndex = STEPS.findIndex((s) => s.key === pr.status);
  const st = PR_STATUS[pr.status]!;

  return (
    <>
      <PageHeader
        backHref="/admin/inventory/purchase-requirements"
        title={
          <>
            Purchase requirement <span className="num text-[var(--text-muted)]">{pr.code}</span>
          </>
        }
        chip={<StatusChip tone={st.tone}>{st.label}</StatusChip>}
        subtitle={`Raised ${formatDate(pr.createdAt)}${pr.supplier ? ` · sent to ${pr.supplier.name}${pr.sentOn ? ` on ${formatDate(pr.sentOn)}` : ""}${pr.poNumber ? ` · PO ${pr.poNumber}` : ""}` : ""}`}
      />

      {pr.status !== "cancelled" ? (
        <ol className="mb-5 grid gap-2.5 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              className="rounded-[var(--r-md)] border px-3.5 py-3 text-[13px] font-semibold"
              style={
                i === stepIndex
                  ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                  : { background: "var(--surface)", color: i < stepIndex ? "var(--text)" : "var(--text-muted)", borderColor: "var(--border)" }
              }
            >
              {i + 1} · {s.title}
              <span className="block text-xs font-normal opacity-85">{i === stepIndex ? "You are here" : s.note}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-5 text-[13.5px] text-[var(--text-muted)]">Cancelled — {pr.cancelReason}</p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-2 pt-4">
            <p className="text-[16px] font-semibold">Lines</p>
            <p className="num text-[13px] text-[var(--text-muted)]">
              {pr.lines.length} item{pr.lines.length === 1 ? "" : "s"}
              {value > 0 ? ` · ${rupees(value)} at last cost, before GST` : ""}
            </p>
          </div>
          <PrLinesEditor
            prId={pr.id}
            editable={editable}
            notes={pr.notes}
            lines={pr.lines.map((l) => ({
              id: l.id,
              item: l.itemType.name,
              unit: l.itemType.unit,
              society: l.society?.name ?? "—",
              shortfall: l.shortfall,
              quantity: l.quantity,
              received: l.received,
              cost: lastCost.get(l.itemTypeId) ?? null,
            }))}
          />
        </Card>

        <div className="flex flex-col gap-4 lg:w-[360px] lg:shrink-0">
          <PrActions prId={pr.id} code={pr.code} status={pr.status} suppliers={suppliers} addable={addable} />
          {pr.batches.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 text-[15px] font-semibold">Received against it</p>
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {pr.batches.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3">
                    <Link href={`/admin/inventory/batches/${b.id}`} className="num font-semibold">
                      {b.code}
                    </Link>
                    <span className="num text-[var(--text-muted)]">
                      {b.quantity.toLocaleString("en-IN")} · {formatDate(b.receivedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
