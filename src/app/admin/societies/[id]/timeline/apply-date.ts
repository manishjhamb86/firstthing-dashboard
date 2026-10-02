import "server-only";
import { db } from "@/lib/db";
import { logChange } from "@/lib/change-log";
import { dayValue, parseValue, TIMELINE_FIELDS, type TimelineField } from "@/lib/timeline-fields";
import { updateLeadDetails, correctProposalDate, correctSurveyDate } from "@/app/admin/pipeline/actions";
import { correctOfferDates } from "@/app/admin/pipeline/[id]/offer/actions";
import { correctAgreementDates } from "@/app/admin/pipeline/[id]/agreement/actions";
import { correctCertificateDate } from "@/app/admin/pipeline/[id]/installation/actions";
import { recordDemoMeter, recordDemoReplacement, setDemoPeriods } from "@/app/admin/societies/[id]/circuits/[circuitId]/demo-step-actions";

/**
 * Writes one timeline date through the correction that already owns it
 * (2026-09-28). The timeline adds no second way to move a date: the lead's
 * dates go through updateLeadDetails, the agreement's through
 * correctAgreementDates, a demo's through its step actions — so each keeps
 * its own ordering checks, its authority rule, and its side effects (the
 * billing start moving with the certificate, invoice months re-derived when a
 * term start moves, a demo's figures re-synced). Those actions check the
 * CURRENT admin, so a direct edit runs as the editor and an accepted request
 * as the approver.
 *
 * Where the owning action keeps no reason (the demo steps, the lead, the
 * proposal, the offer), a ChangeLog row carrying it is written here, so every
 * timeline change leaves who, old → new, and why.
 *
 * The three dates with no correction path before the timeline — service-line
 * enrolment, survey assignment, replacement assignment — are single stamped
 * columns with nothing downstream, and are written here directly.
 */

export type ApplyInput = {
  field: TimelineField;
  entityId: string;
  value: string;
  /** Required after go-live; optional in demo mode. */
  reason: string;
  actorId: string;
};

type Result = { error?: string };

const errorOf = (r: object | undefined | null): Result =>
  r && "error" in r && typeof r.error === "string" && r.error ? { error: r.error } : {};
const iso = (d: Date | null | undefined) => dayValue(d) ?? "";

export async function applyTimelineDate(i: ApplyInput): Promise<Result> {
  const parsed = parseValue(i.value, TIMELINE_FIELDS[i.field].range);
  if (!parsed) return { error: "Pick a valid date." };
  const day = iso(parsed.from);
  const reason = i.reason.trim();

  switch (i.field) {
    case "society.createdAt": {
      const soc = await db.society.findUnique({ where: { id: i.entityId }, select: { id: true, createdAt: true } });
      if (!soc) return { error: "That society is no longer on record." };
      await db.$transaction(async (tx) => {
        await tx.society.update({ where: { id: soc.id }, data: { createdAt: parsed.from } });
        await logChange(tx, { entity: "society", entityId: soc.id, kind: "edit", field: "createdAt", oldValue: iso(soc.createdAt), newValue: day, reason: reason || null, actorId: i.actorId });
      });
      return {};
    }

    case "engagement.createdAt": {
      const e = await db.engagement.findUnique({ where: { id: i.entityId }, select: { id: true, createdAt: true } });
      if (!e) return { error: "That enrolment is no longer on record." };
      await db.$transaction(async (tx) => {
        await tx.engagement.update({ where: { id: e.id }, data: { createdAt: parsed.from } });
        await logChange(tx, { entity: "engagement", entityId: e.id, kind: "edit", field: "createdAt", oldValue: iso(e.createdAt), newValue: day, reason: reason || null, actorId: i.actorId });
      });
      return {};
    }

    case "pipeline.surveyAssignedAt": {
      const p = await db.pipeline.findUnique({ where: { id: i.entityId }, select: { id: true, surveyAssignedAt: true } });
      if (!p) return { error: "That deal is no longer on record." };
      await db.$transaction(async (tx) => {
        await tx.pipeline.update({ where: { id: p.id }, data: { surveyAssignedAt: parsed.from } });
        await logChange(tx, { entity: "pipeline", entityId: p.id, kind: "edit", field: "surveyAssignedAt", oldValue: iso(p.surveyAssignedAt), newValue: day, reason: reason || null, actorId: i.actorId });
      });
      return {};
    }

    case "demo.replacementAssignedAt": {
      const d = await db.circuitDemo.findUnique({ where: { id: i.entityId }, select: { id: true, circuitId: true, voidedAt: true, replacementAssignedAt: true } });
      if (!d || d.voidedAt) return { error: "That demo is no longer on record." };
      if (!d.replacementAssignedAt) return { error: "The replacement has not been assigned yet — assign it on the demo first." };
      await db.$transaction(async (tx) => {
        await tx.circuitDemo.update({ where: { id: d.id }, data: { replacementAssignedAt: parsed.from } });
        await logChange(tx, { entity: "circuit_demo", entityId: d.id, kind: "edit", field: "replacementAssignedAt", circuitId: d.circuitId, demoId: d.id, oldValue: iso(d.replacementAssignedAt), newValue: day, reason: reason || null, actorId: i.actorId });
      });
      return {};
    }

    case "pipeline.createdAt":
    case "pipeline.meetingDate": {
      const p = await db.pipeline.findUnique({
        where: { id: i.entityId },
        select: { id: true, contactName: true, contactPhone: true, meetingDate: true, salesOwnerId: true, notes: true, dealScope: true, createdAt: true },
      });
      if (!p) return { error: "That deal is no longer on record." };
      const lead = i.field === "pipeline.createdAt";
      const r = await updateLeadDetails(p.id, {
        contactName: p.contactName,
        contactPhone: p.contactPhone ?? undefined,
        meetingDate: lead ? iso(p.meetingDate) : day,
        salesOwnerId: p.salesOwnerId,
        notes: p.notes ?? undefined,
        dealScope: p.dealScope ?? undefined,
        loggedOn: lead ? day : undefined,
      });
      if (r?.error) return errorOf(r);
      await note("pipeline", p.id, lead ? "createdAt" : "meetingDate", lead ? p.createdAt : p.meetingDate, day, reason, i.actorId);
      return {};
    }

    case "pipeline.proposalDecidedAt": {
      const p = await db.pipeline.findUnique({ where: { id: i.entityId }, select: { id: true, proposalDecidedAt: true } });
      if (!p) return { error: "That deal is no longer on record." };
      const r = await correctProposalDate(p.id, day);
      if (r.error) return errorOf(r);
      await note("pipeline", p.id, "proposalDecidedAt", p.proposalDecidedAt, day, reason, i.actorId);
      return {};
    }

    case "pipeline.survey":
      return errorOf(
        await correctSurveyDate({ pipelineId: i.entityId, on: day, reason: reason || "Corrected from the society timeline before go-live.", moveEarlier: false }),
      );

    case "demo.meterInstalledAt": {
      const d = await db.circuitDemo.findUnique({ where: { id: i.entityId }, select: { id: true, meterId: true, meterDisplayedLoad: true, meterInstalledAt: true } });
      if (!d) return { error: "That demo is no longer on record." };
      const r = await recordDemoMeter({ demoId: d.id, meterId: d.meterId, installedOn: day, displayedLoad: d.meterDisplayedLoad });
      if (r.error) return errorOf(r);
      await note("circuit_demo", d.id, "meterInstalledAt", d.meterInstalledAt, day, reason, i.actorId, d.id);
      return {};
    }

    case "demo.pre":
    case "demo.post": {
      const d = await db.circuitDemo.findUnique({ where: { id: i.entityId }, select: { id: true, preFrom: true, preTo: true, postFrom: true, postTo: true } });
      if (!d) return { error: "That demo is no longer on record." };
      const pre = i.field === "demo.pre";
      const to = iso(parsed.to);
      const r = await setDemoPeriods(d.id, {
        preFrom: pre ? day : iso(d.preFrom),
        preTo: pre ? to : iso(d.preTo),
        postFrom: pre ? iso(d.postFrom) : day,
        postTo: pre ? iso(d.postTo) : to,
      });
      if (r.error) return errorOf(r);
      const old = pre ? [d.preFrom, d.preTo] : [d.postFrom, d.postTo];
      await note("circuit_demo", d.id, pre ? "prePeriod" : "postPeriod", old[0] && old[1] ? `${iso(old[0])}/${iso(old[1])}` : null, i.value, reason, i.actorId, d.id);
      return {};
    }

    case "demo.lightReplacementDate": {
      const d = await db.circuitDemo.findUnique({ where: { id: i.entityId }, select: { id: true, lightReplacementDate: true } });
      if (!d) return { error: "That demo is no longer on record." };
      const r = await recordDemoReplacement({ demoId: d.id, replacedOn: day });
      if (r.error) return errorOf(r);
      await note("circuit_demo", d.id, "lightReplacementDate", d.lightReplacementDate, day, reason, i.actorId, d.id);
      return {};
    }

    case "offer.issuedAt":
    case "offer.respondedAt": {
      const o = await db.offer.findUnique({ where: { id: i.entityId }, select: { id: true, pipelineId: true, issuedAt: true, respondedAt: true } });
      if (!o?.issuedAt) return { error: "That offer has not been issued." };
      const issued = i.field === "offer.issuedAt";
      const r = await correctOfferDates(o.pipelineId, o.id, {
        issuedOn: issued ? day : iso(o.issuedAt),
        respondedOn: issued ? (o.respondedAt ? iso(o.respondedAt) : null) : day,
      });
      if (r.error) return errorOf(r);
      await note("offer", o.id, issued ? "issuedAt" : "respondedAt", issued ? o.issuedAt : o.respondedAt, day, reason, i.actorId);
      return {};
    }

    case "agreement.preparedAt":
    case "agreement.printedAt":
    case "agreement.notarizedAt":
    case "agreement.signedAt":
    case "agreement.uploadedAt":
    case "contract.activatedAt":
    case "contract.term": {
      const a = await db.agreement.findUnique({ where: { pipelineId: i.entityId } });
      if (!a) return { error: "There is no agreement to correct." };
      const k = await db.contract.findUnique({ where: { pipelineId: i.entityId }, select: { activatedAt: true, termStart: true, termEnd: true } });
      const input = {
        prepared: iso(a.preparedAt),
        printed: iso(a.printedAt),
        notarized: iso(a.notarizedAt),
        signed: iso(a.signedAt),
        uploaded: iso(a.uploadedAt),
        activated: iso(k?.activatedAt),
        termStart: iso(k?.termStart),
        termEnd: iso(k?.termEnd),
        reason,
      };
      const keys: Partial<Record<TimelineField, "prepared" | "printed" | "notarized" | "signed" | "uploaded" | "activated">> = {
        "agreement.preparedAt": "prepared",
        "agreement.printedAt": "printed",
        "agreement.notarizedAt": "notarized",
        "agreement.signedAt": "signed",
        "agreement.uploadedAt": "uploaded",
        "contract.activatedAt": "activated",
      };
      const key = keys[i.field];
      if (i.field === "contract.term") {
        if (!k) return { error: "There is no contract to correct." };
        input.termStart = day;
        input.termEnd = iso(parsed.to);
      } else if (key) {
        input[key] = day;
      }
      return errorOf(await correctAgreementDates(i.entityId, input));
    }

    case "certificate.signedAt":
      return errorOf(await correctCertificateDate(i.entityId, { signedOn: day, reason }));
  }
}

/** The ChangeLog row for a correction whose owning action keeps no reason. */
async function note(entity: string, entityId: string, field: string, oldValue: Date | string | null, newValue: string, reason: string, actorId: string, demoId?: string) {
  await db.$transaction((tx) =>
    logChange(tx, {
      entity,
      entityId,
      kind: "timeline_correction",
      field,
      demoId: demoId ?? null,
      oldValue: oldValue instanceof Date ? iso(oldValue) : oldValue,
      newValue,
      reason: reason || null,
      actorId,
    }),
  );
}
