"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { scheduleJob } from "@/lib/jobs";
import { nextDayUTC } from "@/lib/monitoring-window";

const LOAD_TOLERANCE_PCT = 10; // CON-17

// FEAT-011: PER-04 validates the meter's displayed load against the
// circuit's theoretical load (light count × wattage). Within ±10%
// (CON-17), the circuit moves to `meter_installed`; outside it, submission
// is blocked with the exact delta (FEAT-011-AC-3) rather than silently
// failing. The delta is persisted either way so a subsequent PER-01
// override (below) has the failed reading to record against, not just a
// pass/fail flag.
export async function submitLoadValidation(circuitId: string, meterDisplayedLoad: number) {
  await requireAdminPermission("manage_survey");

  if (!Number.isFinite(meterDisplayedLoad) || meterDisplayedLoad <= 0) {
    return { error: "Meter displayed load must be a positive number." };
  }

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const theoreticalLoad = circuit.meteredLightCount * circuit.wattage;
  const discrepancyPct = (Math.abs(meterDisplayedLoad - theoreticalLoad) / theoreticalLoad) * 100;
  const withinTolerance = discrepancyPct <= LOAD_TOLERANCE_PCT;

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      meterDisplayedLoad,
      loadDiscrepancyPct: discrepancyPct,
      // FEAT-012 — the pre-install window's start date is fixed the
      // moment the meter passes validation; the install day itself is
      // excluded (window starts the following calendar day).
      ...(withinTolerance
        ? { state: "meter_installed", meterInstalledAt: new Date(), preInstallWindowStartAt: nextDayUTC(new Date()) }
        : {}),
    },
  });

  logger.info("circuit.load_validation_submitted", {
    circuitId,
    theoreticalLoad,
    meterDisplayedLoad,
    discrepancyPct,
    withinTolerance,
  });

  if (!withinTolerance) {
    return {
      error: `Discrepancy of ${discrepancyPct.toFixed(1)}% exceeds the ±${LOAD_TOLERANCE_PCT}% threshold — recheck light count, wattage, and any extra load on this circuit before resubmitting.`,
    };
  }
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}

// FEAT-011-AC-4/AC-5 — only PER-01 can override a persistently failed
// validation (e.g. a known meter-display quirk), and the override is
// recorded and visible on the circuit's record going forward, never
// silently accepted as if it had passed normally. Same "hold both
// permissions" PER-01 proxy already established for the light-count
// exception (survey/actions.ts).
export async function overrideLoadValidation(circuitId: string, reason: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!reason.trim()) return { error: "A reason is required to override a failed load validation." };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.meterDisplayedLoad == null) return { error: "No load reading has been submitted yet." };

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      state: "meter_installed",
      meterInstalledAt: new Date(),
      preInstallWindowStartAt: nextDayUTC(new Date()),
      loadValidationOverrideById: session.user.id,
      loadValidationOverrideReason: reason.trim(),
    },
  });

  logger.info("circuit.load_validation_overridden", {
    circuitId,
    overriddenBy: session.user.id,
    reason,
    loadDiscrepancyPct: circuit.loadDiscrepancyPct,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}

// FEAT-011/CON-18 — the demo-installation gate pass: an itemized equipment
// list signed and photographed by PER-04 before leaving site, then
// backend-approved. Photo capture here is a URL field, not a wired S3
// upload — this greenfield build has no file-storage infrastructure yet
// (the archived app's S3 pipeline wasn't ported), same class of deliberate
// gap as the 5 still-unbuilt document upload types noted in
// PROJECT_CONTEXT.md; a real upload widget is a follow-up, not silently
// skipped.
// `kind` distinguishes FEAT-011's install gate pass from FEAT-013's
// completion gate pass — two instances of the same cross-cutting
// component (09-architecture.md §5), each gated to the state it belongs
// after.
export async function submitGatePass(
  circuitId: string,
  items: string[],
  photoUrl: string | undefined,
  kind: "demo_install" | "demo_install_completion" = "demo_install"
) {
  const session = await requireAdminPermission("manage_survey");

  const cleanItems = items.map((i) => i.trim()).filter(Boolean);
  if (cleanItems.length === 0) return { error: "At least one equipment item is required." };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const requiredState = kind === "demo_install" ? "meter_installed" : "awaiting_installation";
  if (circuit.state !== requiredState) {
    return {
      error:
        kind === "demo_install"
          ? "The gate pass opens only after the meter's load validation has passed."
          : "The completion gate pass opens only after the pre-install monitoring window finishes.",
    };
  }

  const gatePass = await db.gatePass.create({
    data: {
      circuitId,
      kind,
      itemsJson: cleanItems,
      photoUrl: photoUrl?.trim() || null,
      submittedById: session.user.id,
    },
  });

  // ADR-006 — a `submitted` pass provisionally releases after 30 minutes
  // if backend approval hasn't landed yet; the sweep job (already running
  // continuously) picks this up on its own polling cadence, no per-pass
  // job needed here.
  await scheduleJob("gatepass_sweep", new Date());

  logger.info("gatepass.submitted", { gatePassId: gatePass.id, circuitId, kind, submittedBy: session.user.id });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}

// Backend approval — PER-01 proxy, same as the other ops-only actions above.
export async function approveGatePass(gatePassId: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  const gatePass = await db.gatePass.findUnique({ where: { id: gatePassId }, include: { circuit: true } });
  if (!gatePass) return { error: "Gate pass not found." };

  await db.gatePass.update({
    where: { id: gatePassId },
    data: { status: "approved", approvedById: session.user.id, approvedAt: new Date() },
  });

  logger.info("gatepass.approved", { gatePassId, approvedBy: session.user.id });
  revalidatePath(`/admin/societies/${gatePass.circuit.societyId}/circuits/${gatePass.circuitId}`);
  return {};
}

export async function rejectGatePass(gatePassId: string, reason: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!reason.trim()) return { error: "A reason is required to reject a gate pass." };

  const gatePass = await db.gatePass.findUnique({ where: { id: gatePassId }, include: { circuit: true } });
  if (!gatePass) return { error: "Gate pass not found." };

  await db.gatePass.update({
    where: { id: gatePassId },
    data: { status: "rejected", rejectedReason: reason.trim(), approvedById: session.user.id, approvedAt: new Date() },
  });

  logger.info("gatepass.rejected", { gatePassId, rejectedBy: session.user.id, reason });
  revalidatePath(`/admin/societies/${gatePass.circuit.societyId}/circuits/${gatePass.circuitId}`);
  return {};
}

// FEAT-013: PER-04 records the light replacement's pivot day (the day the
// last light was replaced, FEAT-013-AC-5 — a multi-day replacement in
// practice still has one recorded date). FEAT-013-AC-3's departure-gating
// rule: the completion gate pass must already be *submitted* (not
// necessarily approved — ADR-006's provisional release covers the wait)
// before this can proceed.
export async function recordLightReplacement(circuitId: string, replacementDate: string) {
  const session = await requireAdminPermission("manage_survey");

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.state !== "awaiting_installation") {
    return { error: "This circuit isn't ready for light replacement yet — the pre-install window must finish first." };
  }

  const completionGatePass = await db.gatePass.findFirst({
    where: { circuitId, kind: "demo_install_completion" },
  });
  if (!completionGatePass) {
    return { error: "Submit the completion gate pass (itemized list + photo) before marking this circuit installed." };
  }

  const date = new Date(replacementDate);
  const windowStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      state: "post_install_pending",
      lightReplacementDate: date,
      postInstallWindowStartAt: windowStart,
    },
  });

  logger.info("circuit.light_replacement_recorded", {
    circuitId,
    replacementDate: date,
    recordedBy: session.user.id,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}
