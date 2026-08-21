import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, statusMeta } from "@/lib/status-maps";
import { LightingInventoryForm } from "./lighting-inventory-form";
import { CircuitEligibilityForm } from "./circuit-eligibility-form";
import { ExceptionApprovalButton } from "./exception-approval-button";
import { DeleteAreaButton } from "./delete-area-button";
import { requireAdminPage } from "@/lib/admin-permissions";
import { resolveCircuitRemoval } from "@/lib/circuit-removal";
import { RemoveCircuitButton } from "@/components/remove-circuit-button";
import { candidateLabel, circuitNextLabel, mostAdvancedCandidate } from "@/lib/deal-progress";
import { NextStepCallout, StepHeading } from "@/components/deal-stepper";

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
    where: { role: "original", active: true, deletedAt: null },
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

  // The survey's two steps, so their headings can say where the work is
  // rather than sitting at "Step 1"/"Step 2" whatever has happened. Step 2
  // is genuinely gated on step 1 — a candidate is judged against the
  // society-wide inventory, so there is nothing to judge it against yet.
  const inventoryDone = siteSurvey.areas.length > 0;
  const candidateDone = circuits.length > 0;

  // CON-11's extrapolation base. Areas are how lights get COUNTED ("Tower B
  // staircase"); light types are how they get BILLED — four towers are four
  // area rows and one type, and the per-type sum is what a metered circuit
  // will represent. The page collected both axes and showed only one, which
  // left the number that decides billing un-shown on the screen that
  // produces it (05-screens SCR-011).
  const byLightType = [...
    siteSurvey.areas
      .reduce((m, a) => {
        const e = m.get(a.lightType) ?? { lights: 0, areas: 0, estimated: 0 };
        e.lights += a.count;
        e.areas += 1;
        if (a.method === "estimated") e.estimated += 1;
        m.set(a.lightType, e);
        return m;
      }, new Map<string, { lights: number; areas: number; estimated: number }>())
      .entries(),
  ].sort((x, y) => y[1].lights - x[1].lights);

  const estimatedAreas = siteSurvey.areas.filter((a) => a.method === "estimated").length;

  // An area's light type and a candidate circuit's light type are two
  // INDEPENDENT free-text fields — real data already holds "Tube Light" on
  // one and "Tubelight" on the other, which an exact match reports as an
  // uncovered type while a candidate plainly exists. Comparing on a
  // normalised key makes the coverage column right in practice; the real
  // fix is one controlled vocabulary across both (CON-11 names five
  // profiles), which is a schema change and belongs in the blueprint, not
  // in a design pass. Flagged rather than silently normalised away.
  const typeKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidateTypeKeys = new Set(circuits.map((c) => typeKey(c.lightType)));
  const hasCandidateFor = (t: string) => candidateTypeKeys.has(typeKey(t));
  const typesWithoutCandidate = byLightType.filter(([t]) => !hasCandidateFor(t)).length;

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
        backHref={`/admin/pipeline/${pipeline.id}`}
        title="Site survey"
        subtitle={pipeline.society.location}
      />

      {handoff && (
        <div className="max-w-none">
          <NextStepCallout next={handoff} />
        </div>
      )}

      {/* What the survey has established so far. Every figure is counted
          from the rows below it, never stored separately. */}
      <StatRow>
        {[
          { label: "Areas counted", value: siteSurvey.areas.length, detail: siteSurvey.areas.length === 0 ? "none yet" : "recorded" },
          { label: "Lights", value: totalLights.toLocaleString("en-IN"), detail: "whole society" },
          { label: "Light types", value: byLightType.length, detail: "each needs a circuit" },
          {
            label: "Candidates",
            value: circuits.length,
            detail:
              byLightType.length === 0
                ? "count the lighting first"
                : typesWithoutCandidate > 0
                  ? `${typesWithoutCandidate} type${typesWithoutCandidate === 1 ? "" : "s"} unresolved`
                  : "every type covered",
          },
        ].map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} detail={f.detail} />
        ))}
      </StatRow>

      <section className="max-w-none mb-10">
        {/* The survey's own two steps are a sequence like any other, so they
            use the spine's marker and chip language rather than a bare
            "Step 1" label that looked the same whether it was done or not. */}
        <StepHeading
          index={1}
          title="Lighting inventory by area"
          status={inventoryDone ? "done" : "current"}
          aside={
            siteSurvey.areas.length > 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                <span className="num">{totalLights}</span> lights across{" "}
                <span className="num">{siteSurvey.areas.length}</span> areas
              </p>
            ) : undefined
          }
        />
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

      {/* The billing axis, derived from the area rows above. Named as the
          extrapolation base rather than as a subtotal, because that is what
          it is: one circuit is metered per type and represents this many
          lights (CON-11). */}
      {byLightType.length > 0 && (
        <section className="max-w-none mb-10">
          <h2 className="text-[15px] font-semibold mb-1">Extrapolation base</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            One circuit is metered per light type, and represents every light of that type. These
            totals are what a bill is extrapolated across — they are not revisited later.
          </p>
          <Card className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Light type</th>
                  <th>Areas</th>
                  <th>Lights represented</th>
                  <th>Candidate circuit</th>
                </tr>
              </thead>
              <tbody>
                {byLightType.map(([type, agg]) => {
                  const covered = hasCandidateFor(type);
                  return (
                    <tr key={type}>
                      <td className="font-medium">{type}</td>
                      <td className="num">{agg.areas}</td>
                      <td className="num">
                        {agg.lights.toLocaleString("en-IN")}
                        {agg.estimated > 0 && (
                          <span className="ml-2 text-xs" style={{ color: "var(--warn-fg)" }}>
                            {agg.estimated} estimated
                          </span>
                        )}
                      </td>
                      <td>
                        {covered ? (
                          <StatusChip tone="ok">Selected</StatusChip>
                        ) : (
                          <StatusChip tone="warn">Not yet</StatusChip>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {estimatedAreas > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--warn-fg)" }}>
              {estimatedAreas} area{estimatedAreas === 1 ? " was" : "s were"} estimated rather than
              walked and counted. Nothing downstream re-counts these — a miscount here biases the
              bill for the whole term.
            </p>
          )}
        </section>
      )}

      <section className="max-w-none">
        <StepHeading
          index={2}
          title="Pick the demo circuit"
          status={candidateDone ? "done" : inventoryDone ? "current" : "locked"}
          hint={
            inventoryDone
              ? undefined
              : "Unlocks once at least one area is recorded — a candidate is judged against the society-wide inventory"
          }
        />
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
