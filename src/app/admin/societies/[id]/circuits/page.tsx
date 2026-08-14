import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { CircuitList } from "./circuit-list";
import { requireAdminPage } from "@/lib/admin-permissions";

export default async function CircuitRegistryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();

  // FEAT-040-AC-4 — PER-04 (manage_survey) can read the registry in the
  // field; editing is PER-01-only, gated inside CircuitList/the edit action.
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/societies");
  const canEdit =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const { id } = await params;
  const society = await db.society.findUnique({ where: { id } });
  if (!society) notFound();

  const circuits = await db.circuit.findMany({
    where: { societyId: id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/societies/${society.id}`} className="hover:underline">
            {society.name}
          </Link>
        }
        title="Circuit registry"
        subtitle="Every metered circuit this society has, through its full commissioning lifecycle."
      />

      {circuits.length === 0 ? (
        // FEAT-040-AC-2 — circuits are created through the survey flow
        // (FEAT-007), never ad hoc from this screen.
        <EmptyState title="No circuits yet">
          Circuits are created through the survey flow, not ad hoc — select a demo-circuit candidate on a
          pipeline&apos;s site survey to register one here.
        </EmptyState>
      ) : (
        <div className="max-w-3xl">
          <CircuitList circuits={circuits} canEdit={canEdit} societyId={society.id} />
        </div>
      )}
    </>
  );
}
