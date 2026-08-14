import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, statusMeta } from "@/lib/status-maps";
import { LightingInventoryForm } from "./lighting-inventory-form";
import { CircuitEligibilityForm } from "./circuit-eligibility-form";
import { ExceptionApprovalButton } from "./exception-approval-button";
import { DeleteAreaButton } from "./delete-area-button";
import { requireAdminPage } from "@/lib/admin-permissions";

export default async function SiteSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/pipeline");

  const canEdit = session.user.adminPermissions?.includes("manage_survey") ?? false;
  const canApproveException = canEdit && (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      siteSurvey: { include: { areas: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!pipeline || !pipeline.siteSurvey) notFound();
  const siteSurvey = pipeline.siteSurvey;

  const circuits = await db.circuit.findMany({
    where: { siteSurveyId: siteSurvey.id },
    orderBy: { createdAt: "asc" },
  });

  const totalLights = siteSurvey.areas.reduce((sum, a) => sum + a.count, 0);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
            {pipeline.society.name}
          </Link>
        }
        title="Site survey"
        subtitle={pipeline.society.location}
      />

      <section className="max-w-2xl mb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
          <h2 className="text-[15px] font-semibold">Lighting inventory by area</h2>
          {siteSurvey.areas.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              <span className="num">{totalLights}</span> lights across{" "}
              <span className="num">{siteSurvey.areas.length}</span> areas
            </p>
          )}
        </div>
        {siteSurvey.areas.length === 0 ? (
          <div className="mb-4">
            <EmptyState title="No areas recorded yet">
              Add each area present at the site below — the society-wide inventory is what the demo circuit
              represents.
            </EmptyState>
          </div>
        ) : (
          <Card className="mb-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Light type</th>
                  <th>Count</th>
                  <th>Method</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {siteSurvey.areas.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.area}</td>
                    <td className="text-[var(--text-muted)]">{a.lightType}</td>
                    <td className="num">{a.count}</td>
                    <td>
                      {a.method === "estimated" ? (
                        <span className="text-xs" style={{ color: "var(--warn-fg)" }}>
                          Estimated{a.note ? ` — ${a.note}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Walked</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <DeleteAreaButton id={a.id} siteSurveyId={siteSurvey.id} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {canEdit && <LightingInventoryForm siteSurveyId={siteSurvey.id} />}
      </section>

      <section className="max-w-2xl">
        <h2 className="text-[15px] font-semibold mb-3">Demo-circuit candidates</h2>
        {circuits.length === 0 ? (
          <div className="mb-4">
            <EmptyState title="No candidate circuits yet">
              Pick a candidate circuit from the site and record it against CON-16&apos;s eligibility checklist.
            </EmptyState>
          </div>
        ) : (
          <Card className="mb-4 divide-y divide-[var(--border-subtle)]">
            {circuits.map((c) => {
              const state =
                c.state === "surveyed"
                  ? { label: "Awaiting light-count exception", tone: "warn" as const }
                  : statusMeta(CIRCUIT_STATE, c.state);
              return (
                <div key={c.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span>
                      <span className="font-medium">{c.lightType}</span>{" "}
                      <span className="text-[var(--text-muted)]">
                        · <span className="num">{c.meteredLightCount}</span> lights ·{" "}
                        <span className="num">{c.wattage}</span>W
                      </span>
                    </span>
                    <StatusChip tone={state.tone}>{state.label}</StatusChip>
                  </div>
                  {c.state === "surveyed" && c.meteredLightCount < 50 && (
                    <div className="mt-2">
                      {c.lightCountExceptionApprovedBy ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          Exception approved — {c.lightCountExceptionReason}
                        </p>
                      ) : canApproveException ? (
                        <ExceptionApprovalButton circuitId={c.id} />
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                          Below the 50-light minimum — needs an exception approval from ops.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        )}
        {canEdit && (
          <CircuitEligibilityForm
            siteSurveyId={siteSurvey.id}
            societyId={pipeline.society.id}
            serviceLine={pipeline.serviceLine}
          />
        )}
      </section>
    </>
  );
}
