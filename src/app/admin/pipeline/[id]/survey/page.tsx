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
import { resolveCircuitRemoval } from "@/lib/circuit-removal";
import { RemoveCircuitButton } from "@/components/remove-circuit-button";
import { candidateLabel, circuitNextLabel, mostAdvancedCandidate } from "@/lib/deal-progress";
import { NextStepCallout } from "@/components/deal-stepper";

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

  // CON-45 — the candidate form's device dropdowns read the catalog.
  const catalogOriginals = await db.deviceType.findMany({
    where: { role: "original", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, defaultWattage: true },
  });

  const circuits = await db.circuit.findMany({
    where: { siteSurveyId: siteSurvey.id, voidedAt: null },
    orderBy: { createdAt: "asc" },
  });

  // A candidate added twice on site is the field team's own housekeeping —
  // resolveCircuitRemoval decides per circuit whether this viewer may tidy it.
  const removal = await resolveCircuitRemoval(
    circuits.map((c) => c.id),
    { id: session.user.id, isOps: canApproveException },
  );

  const totalLights = siteSurvey.areas.reduce((sum, a) => sum + a.count, 0);

  // Where does this survey hand off? Once a candidate clears eligibility,
  // everything that comes next (meter, windows, benchmark) happens on the
  // CIRCUIT page — the hand-off this screen previously never stated, which
  // is exactly where the flow got lost.
  const top = mostAdvancedCandidate(
    circuits.map((c) => ({ id: c.id, state: c.state, location: c.location, lightType: c.lightType })),
  );
  const handoff =
    top && top.state !== "surveyed" && top.state !== "ineligible"
      ? {
          label: circuitNextLabel(top.state),
          detail: `Commissioning continues on the circuit page for ${candidateLabel(top)} — not here.`,
          href: `/admin/societies/${pipeline.society.id}/circuits/${top.id}`,
        }
      : null;

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

      {handoff && <NextStepCallout next={handoff} />}

      <section className="max-w-2xl mb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
          <h2 className="text-[15px] font-semibold">
            <span className="lbl mr-2" style={{ color: "var(--accent)" }}>
              Step 1
            </span>
            Lighting inventory by area
          </h2>
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
        {canEdit &&
          (siteSurvey.areas.length === 0 ? (
            <LightingInventoryForm siteSurveyId={siteSurvey.id} />
          ) : (
            <details className="group">
              <summary className="text-sm underline cursor-pointer select-none text-[var(--text-muted)] list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Add another area</span>
                <span className="hidden group-open:inline">Close</span>
              </summary>
              <div className="mt-3">
                <LightingInventoryForm siteSurveyId={siteSurvey.id} />
              </div>
            </details>
          ))}
      </section>

      <section className="max-w-2xl">
        <h2 className="text-[15px] font-semibold mb-3">
          <span className="lbl mr-2" style={{ color: "var(--accent)" }}>
            Step 2
          </span>
          Pick the demo circuit
        </h2>
        {/* Step 2 waits on step 1 — a candidate is judged against CON-16
            with the society-wide inventory as its context (the demo circuit
            REPRESENTS that inventory), so offering the form before any area
            exists invites recording a candidate against nothing. */}
        {siteSurvey.areas.length === 0 ? (
          <EmptyState title="Record the inventory first">
            The demo circuit represents the whole society&apos;s lighting, so the area-by-area inventory
            above comes first. This step opens once at least one area is recorded.
          </EmptyState>
        ) : (
          <>
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
                    <span className="flex items-center gap-3">
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                      <RemoveCircuitButton
                        circuitId={c.id}
                        label={c.location || c.lightType}
                        canRemove={removal.get(c.id)?.canRemove ?? false}
                        blockLabel={removal.get(c.id)?.blockLabel ?? null}
                      />
                    </span>
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
        {canEdit &&
          (circuits.length === 0 ? (
            <CircuitEligibilityForm
              siteSurveyId={siteSurvey.id}
              societyId={pipeline.society.id}
              serviceLine={pipeline.serviceLine}
              catalog={catalogOriginals}
            />
          ) : (
            <details className="group">
              <summary className="text-sm underline cursor-pointer select-none text-[var(--text-muted)] list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Add another candidate circuit</span>
                <span className="hidden group-open:inline">Close</span>
              </summary>
              <div className="mt-3">
                <CircuitEligibilityForm
                  siteSurveyId={siteSurvey.id}
                  societyId={pipeline.society.id}
                  serviceLine={pipeline.serviceLine}
                  catalog={catalogOriginals}
                />
              </div>
            </details>
          ))}
          </>
        )}
      </section>
    </>
  );
}
