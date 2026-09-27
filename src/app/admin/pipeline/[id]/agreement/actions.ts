"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { isDemoMode } from "@/lib/demo-mode";
import { logChange } from "@/lib/change-log";
import { refuseDateCorrector } from "@/lib/installation-dates";
import { refuseAgreementDates } from "@/lib/agreement-dates";
import { startOfDayUTC } from "@/lib/step-dates";
import { projectCircuitMonitoring } from "@/lib/monitoring-projection";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";
import { logger } from "@/lib/logger";
import { refuseOrderedDate } from "@/lib/step-dates";
import { KYC_TYPE_LABEL } from "@/lib/kyc";
import { bestKycAcross, kycMissing } from "@/lib/kyc-society";
import type { OfferCircuitTerm } from "@/lib/offer";
import { fileStoredDocumentForSociety } from "@/app/admin/documents/actions";

// FEAT-029-AC-4 / FEAT-062-AC-4 — agreement preparation and contract term
// confirmation are PER-01's, not any pipeline actor's.
async function requirePer01() {
  await requireAdminPermission("manage_survey");
  return requireAdminPermission("manage_pipeline");
}

// FEAT-029-AC-1 — the agreement is prepared *from the accepted offer's
// terms*, so there is nothing to prepare until an offer is actually
// accepted. KYC is checked here too: an agreement drawn up while a required
// document is still outstanding is one that cannot legally complete.
export async function prepareAgreement(pipelineId: string) {
  const session = await requirePer01();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      offers: { where: { status: "accepted" }, orderBy: { version: "desc" }, take: 1 },
      agreement: true,
      // KYC is a society fact (kyc-society.ts): a certificate verified on a
      // sibling deal satisfies GATE-01 here too.
society: { include: { pipelines: { select: { kycRequirements: { select: { pipelineId: true, type: true, status: true, updatedAt: true } } } } } },
    },
  });
  if (!pipeline) return { error: "Deal not found." };
  if (pipeline.agreement) return { error: "An agreement has already been prepared for this deal." };

  const accepted = pipeline.offers[0];
  if (!accepted) return { error: "No accepted offer — an agreement is prepared from the terms the society accepted." };

  const missing = kycMissing(bestKycAcross(pipeline.society.pipelines.flatMap((p) => p.kycRequirements), pipelineId), {
    gstNumber: pipeline.society.gstNumber,
    electricityUnitRate: pipeline.society.electricityUnitRate,
  });
  if (missing.length > 0) {
    return {
      error: `KYC is incomplete — ${missing.map((m) => KYC_TYPE_LABEL[m]).join(" and ")} still outstanding.`,
    };
  }

  await db.agreement.create({
    data: { pipelineId, offerId: accepted.id, preparedById: session.user.id },
  });

  logger.info("agreement.prepared", { actorId: session.user.id, pipelineId, offerId: accepted.id });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-029-AC-2 — print / notarize / sign are discrete steps, so each is
// stamped on its own rather than collapsing into one opaque status.
/**
 * `on` (YYYY-MM-DD) dates the step when it is being recorded after the fact
 * (user-asked 2026-09-15, backdated deals); omitted, it is now. The steps are
 * ordered in reality, so they are ordered here in both directions: printed no
 * earlier than the offer was accepted, notarized no earlier than printed,
 * signed no earlier than notarized, none in the future.
 */
export async function markAgreementStep(pipelineId: string, step: "printed" | "notarized" | "signed", on?: string) {
  const session = await requirePer01();
  const agreement = await db.agreement.findUnique({ where: { pipelineId }, include: { offer: { select: { respondedAt: true } } } });
  if (!agreement) return { error: "Prepare the agreement first." };

  // The steps are ordered in reality, so they are ordered here: a document
  // cannot be notarized before it is printed.
  if (step === "notarized" && !agreement.printedAt) return { error: "Print the agreement before notarizing it." };
  if (step === "signed" && !agreement.notarizedAt) return { error: "Notarize the agreement before recording signature." };

  let at = new Date();
  if (on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { error: "Pick a valid date." };
    at = new Date(`${on}T00:00:00.000Z`);
    const label = { printed: "Printing", notarized: "Notarization", signed: "The signature" }[step];
    const refusal = refuseOrderedDate({
      subject: label,
      date: at,
      now: new Date(),
      mustNotPrecede: [
        { label: "the offer was accepted", date: agreement.offer.respondedAt },
        ...(step !== "printed" ? [{ label: "it was printed", date: agreement.printedAt }] : []),
        ...(step === "signed" ? [{ label: "it was notarized", date: agreement.notarizedAt }] : []),
      ],
    });
    if (refusal) {
      logger.warn("agreement.step_refused", { actorId: session.user.id, pipelineId, step, reason: refusal });
      return { error: refusal };
    }
  }

  await db.agreement.update({
    where: { pipelineId },
    data: { [`${step}At`]: at },
  });

  logger.info("agreement.step_recorded", { actorId: session.user.id, pipelineId, step, on: on ?? null });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-029-AC-5 — the executed document is authoritative, but a difference
// from the accepted offer has to be *visible*, not silently reconciled.
export async function uploadExecutedAgreement(
  pipelineId: string,
  input: {
    s3Key: string;
    fileName: string;
    hasDeviation: boolean;
    deviationNote: string;
    period: string;
    contentType: string;
    byteSize: number;
  },
) {
  const session = await requirePer01();
  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId }, select: { societyId: true } });
  if (!pipeline) return { error: "Deal not found." };
  const agreement = await db.agreement.findUnique({ where: { pipelineId } });
  if (!agreement) return { error: "Prepare the agreement first." };
  if (!agreement.signedAt) return { error: "Record the physical signature before uploading the executed scan." };
  if (!input.s3Key) return { error: "Attach the scanned document." };
  if (input.hasDeviation && !input.deviationNote.trim()) {
    return { error: "Describe how the signed document differs from the accepted offer." };
  }

  await db.agreement.update({
    where: { pipelineId },
    data: {
      executedS3Key: input.s3Key,
      executedFileName: input.fileName,
      uploadedAt: new Date(),
      uploadedById: session.user.id,
      hasDeviation: input.hasDeviation,
      deviationNote: input.hasDeviation ? input.deviationNote.trim() : null,
    },
  });

  // File it as a StoredDocument too — this is what the resident portal's
  // Documents page actually reads (it never reads Agreement.executedS3Key
  // directly), and a scan that only lands on the internal Agreement record
  // is invisible to the society it belongs to. A hash collision against an
  // already-filed version is not a refusal here — the signature was just
  // recorded, so this scan is genuinely new — logged and swallowed rather
  // than surfaced, since the executed-scan upload itself must not fail over
  // a documents-listing nicety.
  const filed = await fileStoredDocumentForSociety({
    societyId: pipeline.societyId,
    docType: "agreement",
    s3Key: input.s3Key,
    fileName: input.fileName,
    contentType: input.contentType,
    byteSize: input.byteSize,
    period: input.period,
    actorId: session.user.id,
  });
  if (filed.error) {
    logger.warn("agreement.executed_document_file_skipped", { pipelineId, reason: filed.error });
  }

  logger.info("agreement.executed_uploaded", {
    actorId: session.user.id,
    pipelineId,
    hasDeviation: input.hasDeviation,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-062 — the contract record. AC-1: every billing-relevant term is
// populated from the accepted offer and linked to the signed document.
export async function activateContract(pipelineId: string, termStart: string) {
  const session = await requirePer01();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: { agreement: { include: { offer: true } }, contract: true },
  });
  if (!pipeline) return { error: "Deal not found." };
  if (pipeline.contract) return { error: "This deal already has a contract." };

  const agreement = pipeline.agreement;
  if (!agreement) return { error: "Prepare and execute the agreement first." };

  // FEAT-029-AC-3's hard gate. Installation commits FirsThing's own capital,
  // so an unexecuted agreement can never be the thing it proceeds on.
  if (!agreement.executedS3Key) {
    return { error: "The executed agreement scan hasn't been uploaded — the deal can't advance without it." };
  }

  const offer = agreement.offer;
  // FEAT-062-AC-3 — a contract cannot activate missing a term FEAT-048/049
  // reads. These are validated at offer time too; re-checked here because
  // this is the last point before they start producing money figures.
  // A lump-sum deal has no share and a revenue-share deal has no lump sum —
  // each is required only on the model that actually bills from it (CON-01
  // amendment, 2026-09-08).
  const priceRecorded =
    offer.pricingModel === "lump_sum"
      ? offer.lumpSumMonthlyFee != null && offer.lumpSumMonthlyFee > 0
      : offer.revenueSharePct != null && offer.revenueSharePct > 0;
  if (!offer.tolerancePct || !priceRecorded || !offer.unitElectricityRate || !offer.termMonths) {
    return { error: "The accepted offer is missing a required billing term — it can't be activated." };
  }

  const start = new Date(`${termStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return { error: "Give a valid term start date." };
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + offer.termMonths);

  await db.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        pipelineId,
        societyId: pipeline.societyId,
        serviceLine: pipeline.serviceLine,
        agreementId: agreement.id,
        status: "active",
        termStart: start,
        termEnd: end,
        activatedAt: new Date(),
        activatedById: session.user.id,
      },
    });

    // Version 1 of the terms, effective from the term start. FEAT-062-AC-5's
    // amendments add versions; nothing ever edits this row, so a prior
    // month always resolves to the version in force at the time (ADR-005).
    await tx.contractTermVersion.create({
      data: {
        contractId: contract.id,
        version: 1,
        effectiveFrom: start,
        benchmarkSource: offer.benchmarkSource,
        tolerancePct: offer.tolerancePct,
        pricingModel: offer.pricingModel,
        revenueSharePct: offer.revenueSharePct,
        lumpSumMonthlyFee: offer.lumpSumMonthlyFee,
        unitElectricityRate: offer.unitElectricityRate,
        exclusions: offer.exclusions ?? undefined,
        amcTerms: offer.amcTerms ?? undefined,
        spareStockCount: offer.spareStockCount,
        circuitBenchmarks: (offer.circuitTerms as OfferCircuitTerm[]) ?? [],
        recordedById: session.user.id,
      },
    });

    await tx.pipeline.update({ where: { id: pipelineId }, data: { stage: "agreed" } });
    await tx.society.update({ where: { id: pipeline.societyId }, data: { status: "active" } });
  });

  logger.info("contract.activated", {
    actorId: session.user.id,
    pipelineId,
    societyId: pipeline.societyId,
    termMonths: offer.termMonths,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  revalidatePath(`/admin/societies/${pipeline.societyId}`);
  return {};
}

// ── Date corrections (2026-09-27, user-asked) ────────────────────────────
//
// Every date on the agreement and its contract, corrected together and
// checked once against the result. Demo mode: free (a reason is optional).
// Once live: operations only, with a reason — the "special request". Every old
// value goes to the change log. The term start is the billing start when no
// completion certificate says otherwise, so moving it re-projects monitoring
// and re-derives published months; it cannot move past a month already
// released to the society (GATE-02).

type AgreementDateInput = {
  prepared: string;
  printed?: string;
  notarized?: string;
  signed?: string;
  uploaded?: string;
  activated?: string;
  termStart?: string;
  termEnd?: string;
  reason: string;
};

export async function correctAgreementDates(pipelineId: string, input: AgreementDateInput) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session has ended. Sign in again." };
  const perms = admin.permissions;
  const refusal0 = refuseDateCorrector({
    demo: await isDemoMode(),
    isField: perms.includes("manage_pipeline"),
    isOps: perms.includes("manage_pipeline") && perms.includes("manage_survey"),
    reason: input.reason,
  });
  if (refusal0) {
    logger.warn("agreement.date_correction_refused", { actorId: admin.id, pipelineId, refusal: refusal0 });
    return { error: refusal0.replace("installation dates are", "agreement dates are") };
  }

  const agreement = await db.agreement.findUnique({
    where: { pipelineId },
    include: { offer: { select: { respondedAt: true } } },
  });
  if (!agreement) return { error: "There is no agreement to correct." };
  const contract = await db.contract.findUnique({ where: { pipelineId }, include: { versions: { orderBy: { version: "asc" } } } });
  const certificate = await db.completionCertificate.findFirst({ where: { project: { pipelineId } }, select: { id: true } });

  const day = (s: string | undefined): Date | null | { error: string } => {
    if (s === undefined || s === "") return null;
    const v = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(v.getTime()) ? { error: `Unreadable date: ${s}.` } : v;
  };
  const parsed = {
    prepared: day(input.prepared),
    printed: day(input.printed),
    notarized: day(input.notarized),
    signed: day(input.signed),
    uploaded: day(input.uploaded),
    activated: day(input.activated),
    termStart: day(input.termStart),
    termEnd: day(input.termEnd),
  };
  for (const v of Object.values(parsed)) if (v && "error" in v) return v;
  const get = (k: keyof typeof parsed) => parsed[k] as Date | null;
  if (!get("prepared")) return { error: "The agreement needs its prepared date." };
  // A step that has happened keeps a date; one that has not stays empty.
  const keep = (current: Date | null, next: Date | null, label: string) => {
    if (current && !next) return { error: `The ${label} date cannot be cleared here — only corrected.` };
    if (!current && next) return { error: `The agreement has not been ${label} yet — record that step first.` };
    return null;
  };
  for (const [cur, next, label] of [
    [agreement.printedAt, get("printed"), "printed"],
    [agreement.notarizedAt, get("notarized"), "notarised"],
    [agreement.signedAt, get("signed"), "signed"],
    [agreement.uploadedAt, get("uploaded"), "uploaded"],
    [contract?.activatedAt ?? null, get("activated"), "activated"],
  ] as const) {
    const e = keep(cur, next, label);
    if (e) return e;
  }
  if (contract && (!get("termStart") || !get("termEnd"))) return { error: "The contract's term needs both dates." };

  const refusal = refuseAgreementDates({
    today: new Date(),
    offerAcceptedOn: agreement.offer.respondedAt,
    prepared: get("prepared")!,
    printed: get("printed"),
    notarized: get("notarized"),
    signed: get("signed"),
    uploaded: get("uploaded"),
    activated: get("activated"),
    termStart: contract ? get("termStart") : null,
    termEnd: contract ? get("termEnd") : null,
  });
  if (refusal) {
    logger.warn("agreement.date_correction_refused", { actorId: admin.id, pipelineId, refusal });
    return { error: refusal };
  }

  const same = (a: Date | null | undefined, b: Date | null) =>
    (a ? startOfDayUTC(a).getTime() : null) === (b ? b.getTime() : null);
  const agreementChanges: [string, Date | null, Date | null][] = (
    [
      ["preparedAt", agreement.preparedAt, get("prepared")],
      ["printedAt", agreement.printedAt, get("printed")],
      ["notarizedAt", agreement.notarizedAt, get("notarized")],
      ["signedAt", agreement.signedAt, get("signed")],
      ["uploadedAt", agreement.uploadedAt, get("uploaded")],
    ] as [string, Date | null, Date | null][]
  ).filter(([, a, b]) => !same(a, b));
  const contractChanges: [string, Date | null, Date | null][] = contract
    ? (
        [
          ["activatedAt", contract.activatedAt, get("activated")],
          ["termStart", contract.termStart, get("termStart")],
          ["termEnd", contract.termEnd, get("termEnd")],
        ] as [string, Date | null, Date | null][]
      ).filter(([, a, b]) => !same(a, b))
    : [];
  if (agreementChanges.length === 0 && contractChanges.length === 0) return { error: "Nothing has changed." };

  const startMoves = contract && contractChanges.some(([f]) => f === "termStart");
  const newStart = get("termStart");
  const month = (x: Date) => x.toISOString().slice(0, 7);
  const circuits = await db.circuit.findMany({ where: { siteSurvey: { pipelineId }, voidedAt: null }, select: { id: true } });
  // Without a certificate the term start is the billing start: it cannot move
  // past a month already released to the society.
  if (startMoves && !certificate && newStart && contract && newStart.getTime() > contract.termStart.getTime() && circuits.length > 0) {
    const released = await db.circuitFeeLine.findFirst({
      where: {
        circuitId: { in: circuits.map((c) => c.id) },
        calculation: { status: "released", supersededById: null, period: { gte: month(contract.termStart), lt: month(newStart) } },
      },
      select: { calculation: { select: { period: true } } },
    });
    if (released) {
      return { error: `${released.calculation.period} has already been billed and released to the society. The term cannot start after a month it was already billed for.` };
    }
  }

  const reason = input.reason.trim() || null;
  await db.$transaction(async (tx) => {
    if (agreementChanges.length > 0) {
      await tx.agreement.update({
        where: { id: agreement.id },
        data: Object.fromEntries(agreementChanges.map(([f, , b]) => [f, b])),
      });
      for (const [f, a, b] of agreementChanges) {
        await logChange(tx, { entity: "agreement", entityId: agreement.id, kind: "edit", field: f, oldValue: a, newValue: b, reason, actorId: admin.id });
      }
    }
    if (contract && contractChanges.length > 0) {
      await tx.contract.update({
        where: { id: contract.id },
        data: Object.fromEntries(contractChanges.map(([f, , b]) => [f, b])),
      });
      for (const [f, a, b] of contractChanges) {
        await logChange(tx, { entity: "contract", entityId: contract.id, kind: "edit", field: f, oldValue: a, newValue: b, reason, actorId: admin.id });
      }
      // Version 1 of the terms starts with the term; a later amendment keeps
      // its own date.
      const v1 = contract.versions[0];
      if (startMoves && newStart && v1 && same(v1.effectiveFrom, startOfDayUTC(contract.termStart))) {
        await tx.contractTermVersion.update({ where: { id: v1.id }, data: { effectiveFrom: newStart } });
        await logChange(tx, { entity: "contract_term_version", entityId: v1.id, kind: "edit", field: "effectiveFrom", oldValue: v1.effectiveFrom, newValue: newStart, reason, actorId: admin.id });
      }
    }
  });

  if (startMoves && !certificate && contract && newStart) {
    const fromPeriod = month(contract.termStart < newStart ? contract.termStart : newStart);
    for (const c of circuits) {
      try {
        await projectCircuitMonitoring(c.id, admin.id);
        await rederiveInvoiceMonthsAfterRescale(c.id, fromPeriod, admin.id);
      } catch (err) {
        logger.error("agreement.term_start_followup_failed", { pipelineId, circuitId: c.id, error: String(err) });
      }
    }
  }

  logger.info("agreement.dates_corrected", {
    actorId: admin.id,
    pipelineId,
    agreement: agreementChanges.map(([f, a, b]) => ({ f, from: a?.toISOString() ?? null, to: b?.toISOString() ?? null })),
    contract: contractChanges.map(([f, a, b]) => ({ f, from: a?.toISOString() ?? null, to: b?.toISOString() ?? null })),
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/portal");
  return { ok: true as const };
}
