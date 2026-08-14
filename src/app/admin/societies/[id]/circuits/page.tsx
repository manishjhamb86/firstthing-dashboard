import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CircuitList } from "./circuit-list";
import { requireAdminPage } from "@/lib/admin-permissions";
import { resolveCircuitRemoval } from "@/lib/circuit-removal";
import { RestoreCircuitButton } from "./restore-circuit-button";

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
    where: { societyId: id, voidedAt: null },
    orderBy: { createdAt: "asc" },
  });

  // Removal authority is per circuit, not per screen: an untouched candidate
  // can be removed by whoever added it, while one with commissioning work
  // needs the ops lead. Resolved server-side — the button is not the gate.
  const removal = await resolveCircuitRemoval(
    circuits.map((c) => c.id),
    { id: session.user.id, isOps: canEdit },
  );

  // Removed circuits are kept and stay visible, collapsed — a soft delete
  // that hides the row completely is indistinguishable from a hard one.
  const removedCircuits = await db.circuit.findMany({
    where: { societyId: id, voidedAt: { not: null } },
    orderBy: { voidedAt: "desc" },
    include: { voidedBy: { select: { name: true, email: true } } },
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
          <CircuitList
            circuits={circuits.map((c) => ({
              ...c,
              canRemove: removal.get(c.id)?.canRemove ?? false,
              blockLabel: removal.get(c.id)?.blockLabel ?? null,
            }))}
            canEdit={canEdit}
            societyId={society.id}
          />
        </div>
      )}

      {removedCircuits.length > 0 && (
        <details className="max-w-3xl mt-6">
          <summary className="text-sm text-[var(--text-muted)] cursor-pointer select-none">
            {removedCircuits.length} removed {removedCircuits.length === 1 ? "circuit" : "circuits"} — kept
            for audit, excluded from monitoring and billing
          </summary>
          <Card className="mt-3 divide-y divide-[var(--border-subtle)]">
            {removedCircuits.map((c) => (
              <div key={c.id} className="p-4 text-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div style={{ opacity: 0.7 }}>
                  <span className="font-medium" style={{ textDecoration: "line-through" }}>
                    {c.location || c.lightType}
                  </span>
                  <p className="text-[var(--text-muted)] text-xs mt-1">
                    Removed by {c.voidedBy?.name ?? c.voidedBy?.email ?? "—"} — {c.voidReason}
                  </p>
                </div>
                {canEdit && <RestoreCircuitButton circuitId={c.id} />}
              </div>
            ))}
          </Card>
        </details>
      )}
    </>
  );
}
