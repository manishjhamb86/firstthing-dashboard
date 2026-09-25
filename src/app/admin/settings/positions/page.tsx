import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, PageHeader } from "@/components/ui";
import { PositionsClient } from "./positions-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member positions" };

/** The list a society member's position is chosen from (2026-09-25). */
export default async function PositionsPage() {
  await requireAdminPage();
  const a = await resolveAdmin();
  if (!a || !(a.permissions.includes("manage_users") || a.permissions.includes("manage_pipeline"))) redirect("/admin");
  const positions = await db.memberPosition.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: { where: { endedOn: null } } } } },
  });
  return (
    <>
      <PageHeader title="Member positions" subtitle="The positions a society member can hold — offered as a dropdown when adding a member." />
      <Card className="p-5">
        <PositionsClient positions={positions.map((p) => ({ id: p.id, name: p.name, active: p.active, holders: p._count.members }))} />
      </Card>
    </>
  );
}
