import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../../admin-nav";
import { CircuitList } from "./circuit-list";

export default async function CircuitRegistryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

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
    <div className="min-h-screen p-10">
      <AdminNav />
      <p className="mb-1 text-sm">
        <Link href={`/admin/societies/${society.id}`} className="text-[var(--text-subtle)] hover:underline">
          {society.name}
        </Link>
      </p>
      <h1 className="text-2xl font-bold mb-8">Circuit registry</h1>

      {circuits.length === 0 ? (
        // FEAT-040-AC-2 — circuits are created through the survey flow
        // (FEAT-007), never ad hoc from this screen.
        <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center max-w-2xl">
          <p className="font-medium mb-1">No circuits yet</p>
          <p className="text-sm text-[var(--text-muted)]">
            Circuits are created through the survey flow, not ad hoc — select a demo-circuit candidate on a
            pipeline&apos;s site survey to register one here.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl">
          <CircuitList circuits={circuits} canEdit={canEdit} societyId={society.id} />
        </div>
      )}
    </div>
  );
}
