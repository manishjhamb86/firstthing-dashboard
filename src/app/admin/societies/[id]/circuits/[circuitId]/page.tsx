import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../../../admin-nav";
import { LoadValidationForm } from "./load-validation-form";
import { GatePassForm } from "./gate-pass-form";
import { GatePassApproval } from "./gate-pass-approval";
import { MonitoringWindowPanel } from "./monitoring-window-panel";
import { LightReplacementForm } from "./light-replacement-form";

const STATE_LABEL: Record<string, string> = {
  surveyed: "Surveyed",
  eligible: "Eligible",
  ineligible: "Ineligible",
  meter_installed: "Meter installed",
  pre_install_monitoring: "Pre-install monitoring",
  awaiting_installation: "Awaiting installation",
  post_install_pending: "Post-install pending",
  post_install_monitoring: "Post-install monitoring",
  benchmark_confirmed: "Benchmark confirmed",
  benchmark_review: "Benchmark under review",
  active_billing: "Active billing",
  retired: "Retired",
};

const GATE_PASS_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted — awaiting backend approval",
  provisional: "Provisionally released (30-minute timeout)",
  approved: "Approved",
  rejected: "Rejected",
};

function GatePassCard({
  gatePass,
  canOverride,
}: {
  gatePass: {
    id: string;
    status: string;
    itemsJson: unknown;
    photoUrl: string | null;
    rejectedReason: string | null;
  };
  canOverride: boolean;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-4 text-sm space-y-2">
      <p className="font-medium">{GATE_PASS_STATUS_LABEL[gatePass.status] ?? gatePass.status}</p>
      <ul className="list-disc list-inside text-[var(--text-muted)]">
        {(gatePass.itemsJson as string[]).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {gatePass.photoUrl && (
        <p className="text-[var(--text-muted)]">
          Photo:{" "}
          <a href={gatePass.photoUrl} target="_blank" rel="noreferrer" className="underline">
            view
          </a>
        </p>
      )}
      {gatePass.rejectedReason && <p style={{ color: "var(--bad-fg)" }}>Rejected — {gatePass.rejectedReason}</p>}
      {(gatePass.status === "submitted" || gatePass.status === "provisional") && canOverride && (
        <GatePassApproval gatePassId={gatePass.id} />
      )}
    </div>
  );
}

export default async function CircuitDetailPage({
  params,
}: {
  params: Promise<{ id: string; circuitId: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/societies");
  const canEdit = session.user.adminPermissions?.includes("manage_survey") ?? false;
  const canOverride =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const { id, circuitId } = await params;
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: true,
      gatePasses: { orderBy: { submittedAt: "desc" } },
      commissioningReadings: { orderBy: { date: "asc" } },
    },
  });
  if (!circuit || circuit.societyId !== id) notFound();

  const installGatePass = circuit.gatePasses.find((g) => g.kind === "demo_install");
  const completionGatePass = circuit.gatePasses.find((g) => g.kind === "demo_install_completion");
  const preInstallReadings = circuit.commissioningReadings
    .filter((r) => r.windowType === "pre_install" && circuit.preInstallWindowStartAt && r.date >= circuit.preInstallWindowStartAt)
    .map((r) => ({ ...r, date: r.date.toISOString() }));
  const preInstallValidCount = preInstallReadings.filter((r) => r.status === "valid").length;
  const preInstallPendingAnomaly = preInstallReadings.some((r) => r.status === "anomaly");
  const postInstallReadings = circuit.commissioningReadings
    .filter((r) => r.windowType === "post_install" && circuit.postInstallWindowStartAt && r.date >= circuit.postInstallWindowStartAt)
    .map((r) => ({ ...r, date: r.date.toISOString() }));
  const postInstallValidCount = postInstallReadings.filter((r) => r.status === "valid").length;
  const postInstallPendingAnomaly = postInstallReadings.some((r) => r.status === "anomaly");

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <p className="mb-1 text-sm">
        <Link href={`/admin/societies/${id}/circuits`} className="text-[var(--text-subtle)] hover:underline">
          {circuit.society.name} · Circuit registry
        </Link>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-8">
        <h1 className="text-2xl font-bold">{circuit.location || circuit.lightType}</h1>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          {STATE_LABEL[circuit.state] ?? circuit.state}
        </span>
      </div>

      {circuit.state === "eligible" && canEdit && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Meter installation & load validation</h2>
          <LoadValidationForm
            circuitId={circuit.id}
            meteredLightCount={circuit.meteredLightCount}
            wattage={circuit.wattage}
            canOverride={canOverride}
            lastDiscrepancyPct={circuit.loadDiscrepancyPct}
          />
        </section>
      )}
      {circuit.state === "eligible" && !canEdit && (
        <p className="text-sm text-[var(--text-muted)] max-w-md mb-10">
          Meter installation and load validation is PER-04&apos;s action — you can read this circuit&apos;s
          record but not edit it.
        </p>
      )}
      {circuit.loadValidationOverrideById && (
        <p className="text-xs text-[var(--text-muted)] max-w-md mb-6">
          Load validation was overridden by ops — {circuit.loadValidationOverrideReason}
          {circuit.loadDiscrepancyPct != null && ` (discrepancy was ${circuit.loadDiscrepancyPct.toFixed(1)}%)`}
        </p>
      )}

      {/* FEAT-011/CON-18 — the demo-installation gate pass. */}
      {circuit.state === "meter_installed" && !installGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Install gate pass</h2>
          {canEdit ? (
            <GatePassForm circuitId={circuit.id} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to submit the gate pass on site.</p>
          )}
        </section>
      )}
      {installGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Install gate pass</h2>
          <GatePassCard gatePass={installGatePass} canOverride={canOverride} />
        </section>
      )}

      {/* FEAT-012 — pre-install baseline monitoring window. */}
      {circuit.preInstallWindowStartAt && (
        <MonitoringWindowPanel
          circuitId={circuit.id}
          windowType="pre_install"
          title="Pre-install monitoring window"
          readings={preInstallReadings}
          validCount={preInstallValidCount}
          pendingAnomaly={preInstallPendingAnomaly}
          canEdit={canEdit && circuit.preInstallBaseline == null}
        />
      )}
      {circuit.preInstallBaseline != null && (
        <p className="text-sm text-[var(--text-muted)] max-w-md -mt-6 mb-10">
          Baseline: {circuit.preInstallBaseline.toFixed(2)} kWh/day
        </p>
      )}

      {/* FEAT-013 — light replacement / demo installation. */}
      {circuit.state === "awaiting_installation" && !completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Completion gate pass</h2>
          {canEdit ? (
            <GatePassForm circuitId={circuit.id} kind="demo_install_completion" />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to submit the completion gate pass.</p>
          )}
        </section>
      )}
      {completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Completion gate pass</h2>
          <GatePassCard gatePass={completionGatePass} canOverride={canOverride} />
        </section>
      )}
      {circuit.state === "awaiting_installation" && completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-lg font-semibold mb-3">Light replacement</h2>
          {canEdit ? (
            <LightReplacementForm circuitId={circuit.id} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to record the replacement date.</p>
          )}
        </section>
      )}
      {circuit.lightReplacementDate && (
        <p className="text-sm text-[var(--text-muted)] max-w-md -mt-6 mb-10">
          Lights replaced: {circuit.lightReplacementDate.toISOString().slice(0, 10)}
        </p>
      )}

      {/* FEAT-014 — post-install monitoring window & benchmark computation. */}
      {circuit.postInstallWindowStartAt && (
        <MonitoringWindowPanel
          circuitId={circuit.id}
          windowType="post_install"
          title="Post-install monitoring window"
          readings={postInstallReadings}
          validCount={postInstallValidCount}
          pendingAnomaly={postInstallPendingAnomaly}
          canEdit={canEdit && circuit.state !== "benchmark_confirmed" && circuit.state !== "benchmark_review"}
        />
      )}
      {circuit.state === "benchmark_confirmed" && circuit.benchmarkSavingsPct != null && (
        <p className="text-sm max-w-md" style={{ color: "var(--ok-fg)" }}>
          Benchmark confirmed — {circuit.benchmarkSavingsPct.toFixed(1)}% savings, fixed for the contract term.
        </p>
      )}
      {circuit.state === "benchmark_review" && (
        <p className="text-sm text-[var(--text-muted)] max-w-md">
          The measured result fell outside CON-20&apos;s 60-80% band — routed to FEAT-015&apos;s investigation
          queue (not yet built) instead of being written as the benchmark.
        </p>
      )}
    </div>
  );
}
