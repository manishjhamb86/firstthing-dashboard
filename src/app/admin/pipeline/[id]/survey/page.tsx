import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../../admin-nav";
import { LightingInventoryForm } from "./lighting-inventory-form";
import { CircuitEligibilityForm } from "./circuit-eligibility-form";
import { ExceptionApprovalButton } from "./exception-approval-button";
import { DeleteAreaButton } from "./delete-area-button";

const CIRCUIT_STATE_LABEL: Record<string, string> = {
  surveyed: "Awaiting light-count exception",
  eligible: "Eligible",
  ineligible: "Ineligible",
};

export default async function SiteSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");
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

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-1">Site survey — {pipeline.society.name}</h1>
      <p className="mb-8 text-[var(--text-muted)]">{pipeline.society.location}</p>

      <section className="max-w-2xl mb-10">
        <h2 className="text-lg font-semibold mb-3">Lighting inventory by area</h2>
        {siteSurvey.areas.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center mb-4">
            <p className="text-sm text-[var(--text-muted)]">
              No areas recorded yet — add each area present at the site below.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)] mb-4">
            {siteSurvey.areas.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm">
                <div>
                  <span className="font-medium">{a.area}</span> · {a.lightType} · {a.count} lights
                  {a.method === "estimated" && (
                    <span className="ml-2 text-xs" style={{ color: "var(--warn-fg)" }}>
                      estimated{a.note ? ` — ${a.note}` : ""}
                    </span>
                  )}
                </div>
                {canEdit && <DeleteAreaButton id={a.id} siteSurveyId={siteSurvey.id} />}
              </div>
            ))}
          </div>
        )}
        {canEdit && <LightingInventoryForm siteSurveyId={siteSurvey.id} />}
      </section>

      <section className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">Demo-circuit candidates</h2>
        {circuits.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center mb-4">
            <p className="text-sm text-[var(--text-muted)]">
              Pick a candidate circuit from the site and record it against CON-16&apos;s eligibility checklist.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)] mb-4">
            {circuits.map((c) => (
              <div key={c.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>
                    {c.lightType} · {c.meteredLightCount} lights · {c.wattage}W
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                    {CIRCUIT_STATE_LABEL[c.state] ?? c.state}
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
            ))}
          </div>
        )}
        {canEdit && (
          <CircuitEligibilityForm
            siteSurveyId={siteSurvey.id}
            societyId={pipeline.society.id}
            serviceLine={pipeline.serviceLine}
          />
        )}
      </section>
    </div>
  );
}
