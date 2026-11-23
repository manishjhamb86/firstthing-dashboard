import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { PR_STATUS } from "./status";
import { formatDate } from "@/lib/format-date";
import { requireInventoryPage } from "../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase requirements" };


export default async function PurchaseRequirementsPage() {
  await requireInventoryPage();
  const prs = await db.purchaseRequirement.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { supplier: { select: { name: true } }, lines: { select: { society: { select: { name: true } }, quantity: true } } },
  });
  return (
    <>
      <PageHeader
        backHref="/admin/inventory/planning"
        title="Purchase requirements"
        subtitle="What has been asked of suppliers. Each is generated from a society's shortfall on Procurement planning, and closes as its deliveries are received."
      />
      <Card className="overflow-hidden">
        {prs.length === 0 ? (
          <div className="p-5">
            <EmptyState title="None yet">Open Procurement planning and generate one from a society&apos;s shortfall.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>For</th>
                  <th>Supplier</th>
                  <th className="text-right">Lines</th>
                  <th>Raised</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((p) => {
                  const societies = [...new Set(p.lines.map((l) => l.society?.name).filter(Boolean))];
                  const st = PR_STATUS[p.status]!;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/inventory/purchase-requirements/${p.id}`} className="num font-semibold">
                          {p.code}
                        </Link>
                      </td>
                      <td>{societies.length ? societies.join(", ") : "—"}</td>
                      <td>{p.supplier?.name ?? <span className="text-[var(--text-muted)]">Not sent yet</span>}</td>
                      <td className="num text-right">{p.lines.length}</td>
                      <td className="num">{formatDate(p.createdAt)}</td>
                      <td>
                        <StatusChip tone={st.tone}>{st.label}</StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
