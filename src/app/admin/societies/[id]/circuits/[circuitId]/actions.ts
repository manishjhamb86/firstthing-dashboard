"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { canOwn, teamMeta } from "@/lib/admin-teams";
import { eventTitle } from "@/lib/schedule";
import { logger } from "@/lib/logger";
import { refuseOrderedDate, refuseReplacementDate } from "@/lib/step-dates";
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
/**
 * The install date is normally "now" — the meter is being validated as it goes
 * in. A circuit commissioned before this system existed has a real install
 * date in the past, and it cannot be left as today: meterInstalledAt fixes the
 * pre-install window start (the day after), so a wrong date silently puts
 * every backfilled reading outside its own window. Hence an explicit date,
 * defaulting to today.
 *
 * The only rule is "not in the future". A "not before the circuit was
 * created" rule was drafted and dropped: a backfilled circuit's ROW is
 * created today while its real install was months ago, so that guard would
 * reject precisely the case this exists for.
 */
type InstallDate = { at: Date; error?: never } | { at?: never; error: string };

function resolveInstallDate(
  installedOn: string | undefined,
  /** The survey that selected this circuit — the meter cannot predate it. */
  surveyedAt: Date | null = null,
): InstallDate {
  if (!installedOn) return { at: new Date() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installedOn)) return { error: "Pick a valid install date." };
  const at = new Date(`${installedOn}T00:00:00.000Z`);

  // Same relative rule as every other step: a backdated install is fine, an
  // install before the survey that chose the circuit is not, in any mode.
  const refusal = refuseOrderedDate({
    subject: "The meter install",
    date: at,
    now: new Date(),
    mustNotPrecede: [{ label: "the site survey", date: surveyedAt }],
  });
  if (refusal) return { error: refusal };
  return { at };
}

export async function submitLoadValidation(
  circuitId: string,
  meterDisplayedLoad: number,
  installedOn?: string,
) {
  await requireAdminPermission("manage_survey");

  if (!Number.isFinite(meterDisplayedLoad) || meterDisplayedLoad <= 0) {
    return { error: "Meter displayed load must be a positive number." };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: { siteSurvey: { select: { createdAt: true } } },
  });
  if (!circuit) return { error: "Circuit not found." };

  const installed = resolveInstallDate(installedOn, circuit.siteSurvey?.createdAt ?? null);
  if (installed.at === undefined) return { error: installed.error };
  const installedAt: Date = installed.at;

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
        ? {
            state: "meter_installed",
            meterInstalledAt: installedAt,
            preInstallWindowStartAt: nextDayUTC(installedAt),
          }
        : {}),
    },
  });

  logger.info("circuit.load_validation_submitted", {
    circuitId,
    theoreticalLoad,
    meterDisplayedLoad,
    discrepancyPct,
    withinTolerance,
    installedOn: installedAt.toISOString().slice(0, 10),
    backdated: installedAt.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10),
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
export async function overrideLoadValidation(circuitId: string, reason: string, installedOn?: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!reason.trim()) return { error: "A reason is required to override a failed load validation." };

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: { siteSurvey: { select: { createdAt: true } } },
  });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.meterDisplayedLoad == null) return { error: "No load reading has been submitted yet." };

  const installed = resolveInstallDate(installedOn, circuit.siteSurvey?.createdAt ?? null);
  if (installed.at === undefined) return { error: installed.error };

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      state: "meter_installed",
      meterInstalledAt: installed.at,
      preInstallWindowStartAt: nextDayUTC(installed.at),
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
  // If the work was already recorded, this pass is the second half of the
  // departure and the circuit moves on now.
  if (kind === "demo_install_completion") await advanceAfterInstall(circuitId);
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
/**
 * FEAT-013 + CON-45 — the installation record. When the circuit carries a
 * load inventory, each line item states what was installed against it,
 * chosen from that device's own compatibility mapping; the date stamp then
 * freezes the inventory and the pre-install baseline together.
 */
export type ReplacementLine = {
  lineId: string;
  replacementTypeId: string;
  count: number;
  wattage: number;
};

/**
 * CON-18 / FEAT-013-AC-1 — the circuit leaves `awaiting_installation` only
 * when BOTH halves of the departure are on record: the work (a replacement
 * date) and the pass that lets the crew leave with the old material.
 *
 * Called from whichever of the two happens second, so the order the crew
 * works in does not change the outcome. The post-install window always
 * starts the day after the LAST light was replaced (CON-19 / FEAT-013-AC-5)
 * — never the day after the gate pass, which may be signed later.
 */
async function advanceAfterInstall(circuitId: string): Promise<boolean> {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: { id: true, state: true, lightReplacementDate: true, societyId: true },
  });
  if (!circuit || circuit.state !== "awaiting_installation") return false;
  if (!circuit.lightReplacementDate) return false;

  const pass = await db.gatePass.findFirst({
    where: { circuitId, kind: "demo_install_completion" },
    select: { id: true },
  });
  if (!pass) return false;

  const d = circuit.lightReplacementDate;
  const windowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  await db.circuit.update({
    where: { id: circuitId },
    data: { state: "post_install_pending", postInstallWindowStartAt: windowStart },
  });
  logger.info("circuit.install_complete", {
    circuitId,
    lightReplacementDate: d.toISOString().slice(0, 10),
    postInstallWindowStartAt: windowStart.toISOString().slice(0, 10),
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return true;
}

export async function recordLightReplacement(
  circuitId: string,
  replacementDate: string,
  replacements: ReplacementLine[] = [],
) {
  const session = await requireAdminPermission("manage_survey");

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      devices: { include: { deviceType: { include: { replacementOptions: true } } } },
    },
  });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.state !== "awaiting_installation") {
    return { error: "This circuit isn't ready for light replacement yet — the pre-install window must finish first." };
  }

  // FEAT-013 — the work has to be handed to a crew and booked with the
  // society first ("this should not be accessible before the light
  // installation is scheduled" — the user, 2026-08-25). The step is locked in
  // the UI, but a locked step is not a gate: the refusal lives here.
  if (!circuit.replacementOwnerId) {
    logger.warn("circuit.replacement_record_refused", { circuitId, reason: "unassigned" });
    return { error: "Assign the replacement to a crew first — nobody has been asked to do this work." };
  }
  const bookedDay = await db.scheduledEvent.findFirst({
    where: { circuitId, kind: "installation_day", status: "scheduled" },
    select: { id: true },
  });
  if (!bookedDay) {
    logger.warn("circuit.replacement_record_refused", { circuitId, reason: "unscheduled" });
    return {
      error: "Book the replacement day with the society first — the date recorded here is the pivot CON-19 excludes.",
    };
  }

  // No gate-pass precondition here, deliberately. CON-18's pass is a
  // DEPARTURE gate: it itemizes the equipment that physically changed at the
  // site and must be approved before the technician leaves. It cannot be
  // written before the work it lists — which is what requiring it here asked
  // for, and what put "Completion gate pass" above "Light replacement" on
  // screen (user-reported 2026-08-24).
  //
  // FEAT-013-AC-3 gates "PER-04 cannot mark the circuit as installed", and
  // that is the act still gated: recording the replacement is free, and the
  // circuit only advances to post-install monitoring once the pass exists
  // (see advanceAfterInstall below, and FEAT-013-AC-1, which lists recording
  // the date BEFORE the gate-pass sign-off).

  // CON-45 — an inventory-carrying circuit records what was installed
  // against every line, from that device's own mapped compatibility list.
  // A circuit with no inventory (legacy flow) keeps the date-only path.
  const byLine = new Map(replacements.map((r) => [r.lineId, r]));
  if (circuit.devices.length > 0) {
    for (const line of circuit.devices) {
      const r = byLine.get(line.id);
      if (!r) {
        return {
          error: `Record what replaced the ${line.count} × ${line.deviceType.name} — every line needs its installed device.`,
        };
      }
      const compatible = line.deviceType.replacementOptions.some(
        (o) => o.replacementTypeId === r.replacementTypeId,
      );
      if (!compatible) {
        return {
          error: `That device isn't in the compatibility list for ${line.deviceType.name} — pick from its mapped replacements, or have ops extend the mapping in the catalog.`,
        };
      }
      if (!Number.isInteger(r.count) || r.count < 1 || r.count > 5000) {
        return { error: `Installed count for ${line.deviceType.name} must be a whole number.` };
      }
      if (!Number.isFinite(r.wattage) || r.wattage <= 0 || r.wattage > 2000) {
        return { error: `Installed wattage for ${line.deviceType.name} must be between 1 and 2000 W.` };
      }
      if (r.count !== line.count) {
        // Not a block — a count difference is real (a broken fitting left
        // unreplaced) — but it must be deliberate, so the client confirms it
        // and the log records it.
        logger.warn("circuit.replacement_count_differs", {
          circuitId,
          lineId: line.id,
          original: line.count,
          installed: r.count,
        });
      }
    }
  }

  const date = new Date(replacementDate);

  // Relative ordering, enforced in BOTH modes: a whole historical
  // commissioning can be entered with real past dates, but the sequence
  // between them still has to hold. Backdating is not a licence to record a
  // replacement before its own meter install.
  const lastPre = await db.commissioningReading.findFirst({
    where: { circuitId, windowType: "pre_install" },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const lastPreCsv = await db.meterReading.findFirst({
    where: { circuitId, date: { lte: date } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const lastReading =
    [lastPre?.date, lastPreCsv?.date].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  const dateRefusal = refuseReplacementDate({
    replacementDate: date,
    meterInstalledAt: circuit.meterInstalledAt,
    lastPreInstallReading: lastReading,
    now: new Date(),
  });
  if (dateRefusal) {
    logger.warn("circuit.replacement_date_refused", { circuitId, replacementDate, reason: dateRefusal });
    return { error: dateRefusal };
  }

  await db.$transaction(async (tx) => {
    for (const line of circuit.devices) {
      const r = byLine.get(line.id)!;
      await tx.circuitDevice.update({
        where: { id: line.id },
        data: {
          replacementTypeId: r.replacementTypeId,
          replacementCount: r.count,
          replacementWattage: r.wattage,
          replacedAt: date,
          replacedById: session.user.id,
        },
      });
    }
    await tx.circuit.update({
      where: { id: circuitId },
      data: { lightReplacementDate: date },
    });
  });

  // FEAT-013-AC-1 — the replacement date and the gate-pass sign-off together
  // move the circuit on. Whichever of the two lands second does it.
  const advanced = await advanceAfterInstall(circuitId);

  logger.info("circuit.light_replacement_recorded", {
    circuitId,
    replacementDate: date,
    linesRecorded: circuit.devices.length,
    recordedBy: session.user.id,
    advanced,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}

// ── FEAT-013 — the replacement is somebody's job before it is a record ─────
//
// "Before the light replacement record there should be an option to first
// schedule the replacement and assign the task to the inspector/installation
// team, who will do the job and update this record — which can also be done
// by the assignee if needed, but with a relevant warning" (the user,
// 2026-08-25). The form used to appear the moment the baseline window closed,
// with nobody's name on it and no day agreed with the society.
//
// The day itself is a ScheduledEvent (installation_day), not a column on the
// circuit: one schedule module for every appointment.

/** Ops, or the person already holding this deal's field work, may hand it on. */
async function mayAssignReplacement(circuitId: string) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." } as const;
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      societyId: true,
      society: { select: { name: true } },
      preInstallBaseline: true,
      lightReplacementDate: true,
      replacementOwnerId: true,
      siteSurvey: { select: { pipeline: { select: { id: true, surveyOwnerId: true } } } },
    },
  });
  if (!circuit) return { error: "Circuit not found." } as const;
  const isOps =
    actor.permissions.includes("manage_survey") && actor.permissions.includes("manage_pipeline");
  const holdsTheFieldWork = circuit.siteSurvey?.pipeline?.surveyOwnerId === actor.id;
  if (!isOps && !holdsTheFieldWork) {
    logger.warn("circuit.replacement_assign_refused", { circuitId, actorId: actor.id });
    return {
      error: "Only operations, or whoever is holding this deal's field work, can hand on the replacement.",
    } as const;
  }
  return { actor, circuit } as const;
}

export async function assignReplacement(input: { circuitId: string; toId: string | null }) {
  const gate = await mayAssignReplacement(input.circuitId);
  if ("error" in gate) return { error: gate.error };
  const { actor, circuit } = gate;

  if (circuit.preInstallBaseline == null) {
    return { error: "The baseline window has not completed yet — there is nothing to replace against." };
  }
  if (circuit.lightReplacementDate) {
    return { error: "The replacement is already recorded." };
  }

  if (input.toId) {
    const to = await db.adminUser.findFirst({
      where: { id: input.toId, isActive: true, deletedAt: null },
      select: { id: true, team: true, name: true, email: true, permissions: true },
    });
    if (!to) return { error: "That account cannot take the replacement." };
    if (!canOwn(to.team, "survey")) {
      return {
        error: `${to.name ?? to.email} is on the ${teamMeta(to.team).label} team — the replacement goes to engineering or inspection.`,
      };
    }
    if (!to.permissions.includes("manage_survey")) {
      return {
        error: `${to.name ?? to.email} does not hold Manage survey, so they could not record the work. Grant it on the users screen first.`,
      };
    }
  }

  await db.circuit.update({
    where: { id: input.circuitId },
    data: {
      replacementOwnerId: input.toId,
      replacementAssignedAt: input.toId ? new Date() : null,
      replacementAssignedById: input.toId ? actor.id : null,
    },
  });

  // The booked day follows the person: reassigning moves it, clearing the
  // assignment cancels it rather than leaving a day booked for nobody.
  if (input.toId) {
    await db.scheduledEvent.updateMany({
      where: { circuitId: input.circuitId, kind: "installation_day", status: "scheduled" },
      data: { assigneeId: input.toId },
    });
  } else {
    await db.scheduledEvent.updateMany({
      where: { circuitId: input.circuitId, kind: "installation_day", status: "scheduled" },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: "The replacement was unassigned — nobody is coming.",
      },
    });
  }

  logger.info("circuit.replacement_assigned", {
    circuitId: input.circuitId,
    toId: input.toId,
    byId: actor.id,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${input.circuitId}`);
  revalidatePath("/admin/schedule");
  return {};
}

export async function updateReplacementVisit(
  circuitId: string,
  input: { scheduledAt?: string; contactName?: string; contactPhone?: string; note?: string },
): Promise<{ error?: string } | undefined> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      societyId: true,
      society: { select: { name: true } },
      replacementOwnerId: true,
    },
  });
  if (!circuit) return { error: "Circuit not found." };
  if (!circuit.replacementOwnerId) {
    return { error: "Assign the replacement to someone first — the visit is theirs to arrange." };
  }
  const mine = circuit.replacementOwnerId === actor.id;
  const isOps =
    actor.permissions.includes("manage_survey") && actor.permissions.includes("manage_pipeline");
  if (!mine && !isOps) {
    logger.warn("circuit.replacement_visit_refused", { circuitId, actorId: actor.id });
    return { error: "Only the assignee or operations can arrange this visit." };
  }

  let scheduledAt: Date | null = null;
  if (input.scheduledAt) {
    scheduledAt = new Date(`${input.scheduledAt}:00.000Z`);
    if (Number.isNaN(scheduledAt.getTime())) return { error: "That is not a valid date and time." };
  }
  const contactName = input.contactName?.trim() || null;
  const contactPhone = input.contactPhone?.trim() || null;
  if (contactPhone && !contactName) {
    return { error: "Say who the number belongs to — a phone number with no name helps nobody at the gate." };
  }

  const existing = await db.scheduledEvent.findFirst({
    where: { circuitId, kind: "installation_day", status: "scheduled" },
    orderBy: { startAt: "asc" },
  });

  if (!scheduledAt) {
    if (existing) {
      await db.scheduledEvent.update({
        where: { id: existing.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledReason: "The slot was cleared — no visit is booked.",
        },
      });
    }
  } else if (existing) {
    await db.scheduledEvent.update({
      where: { id: existing.id },
      data: {
        startAt: scheduledAt,
        assigneeId: circuit.replacementOwnerId,
        contactName,
        contactPhone,
        note: input.note?.trim() || null,
      },
    });
  } else {
    await db.scheduledEvent.create({
      data: {
        kind: "installation_day",
        title: eventTitle("installation_day", circuit.society.name),
        startAt: scheduledAt,
        assigneeId: circuit.replacementOwnerId,
        createdById: actor.id,
        societyId: circuit.societyId,
        circuitId,
        contactName,
        contactPhone,
        note: input.note?.trim() || null,
      },
    });
  }

  logger.info("circuit.replacement_visit_updated", {
    circuitId,
    actorId: actor.id,
    byAssignee: mine,
    scheduledAt: input.scheduledAt,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  revalidatePath("/admin/schedule");
  return {};
}
