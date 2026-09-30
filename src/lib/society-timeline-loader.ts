import { db } from "@/lib/db";
import { dealLabel } from "@/lib/deal-scope";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { formatDate, monthLabel } from "@/lib/format-date";
import { surveyHappenedAt } from "@/lib/step-dates";
import { FIRST_INVOICE_SLOT, firstBillingDay, type Branch, type FirstInvoice, type Step } from "@/lib/society-chronology";

/**
 * Reads one society's whole chronology into the tree the chronology module
 * checks (2026-09-28). The step list and its source fields are the table in
 * docs/research/reports/Society lifecycle timeline design.md; where the
 * research and the reviewed design differ, the design wins — gate passes and
 * the demo report's share date are record time (stamped when typed in), so
 * they are shown with that note and never checked.
 *
 * Nothing here invents a date: a step with no field is "no date recorded".
 */

type Ctx = { branchId: string };
const step = (ctx: Ctx, s: Omit<Step, "id">): Step => ({ ...s, id: `${ctx.branchId}:${s.slot}` });

const survey = { where: { kind: "survey_visit" as const, status: { not: "cancelled" as const } }, orderBy: { startAt: "desc" as const }, take: 1, select: { startAt: true } };

export async function loadSocietyTimeline(societyId: string) {
  const society = await db.society.findUnique({
    where: { id: societyId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      closedAt: true,
      closedReason: true,
      engagements: { select: { id: true, serviceLine: true, createdAt: true, status: true } },
      pipelines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          serviceLine: true,
          dealScope: true,
          stage: true,
          createdAt: true,
          meetingDate: true,
          proposalDecidedAt: true,
          proposalOutcome: true,
          surveyAssignedAt: true,
          closedLostAt: true,
          closedLostReason: true,
          scheduledEvents: survey,
          siteSurvey: {
            select: {
              createdAt: true,
              circuits: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  location: true,
                  lightType: true,
                  createdAt: true,
                  voidedAt: true,
                  voidReason: true,
                  representedLightCount: true,
                  meteredLightCount: true,
                  demos: {
                    orderBy: { sequence: "asc" },
                    select: {
                      id: true,
                      sequence: true,
                      meteredLightCount: true,
                      savingsPct: true,
                      rejected: true,
                      rejectionReason: true,
                      voidedAt: true,
                      voidReason: true,
                      createdAt: true,
                      meterInstalledAt: true,
                      meterSkipped: true,
                      preFrom: true,
                      preTo: true,
                      replacementAssignedAt: true,
                      lightReplacementDate: true,
                      postFrom: true,
                      postTo: true,
                      gatePasses: { select: { kind: true, status: true, submittedAt: true, approvedAt: true } },
                      scheduledEvents: {
                        where: { kind: "installation_day", status: { not: "cancelled" } },
                        orderBy: { startAt: "desc" },
                        take: 1,
                        select: { startAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
          demoReports: { where: { status: "shared" }, orderBy: { version: "desc" }, take: 1, select: { version: true, sharedAt: true } },
          offers: {
            where: { issuedAt: { not: null } },
            orderBy: { version: "desc" },
            take: 1,
            select: { id: true, version: true, status: true, issuedAt: true, respondedAt: true },
          },
          agreement: {
            select: { id: true, preparedAt: true, printedAt: true, notarizedAt: true, signedAt: true, uploadedAt: true },
          },
          contract: {
            select: { id: true, status: true, activatedAt: true, termStart: true, termEnd: true, terminatedOn: true, terminationReason: true },
          },
          installationProject: {
            select: {
              batches: { where: { submittedAt: { not: null } }, select: { submittedAt: true, review: { select: { reviewedAt: true } } } },
              certificate: { select: { id: true, signedAt: true, billingStartDate: true } },
            },
          },
        },
      },
    },
  });
  if (!society) return null;

  const invoices = await db.billingInvoice.findMany({
    where: { voidedAt: null, calculation: { societyId, supersededAt: null } },
    orderBy: { issueDate: "asc" },
    select: {
      id: true,
      number: true,
      issueDate: true,
      dueDate: true,
      status: true,
      releasedAt: true,
      calculation: { select: { period: true, serviceLine: true, proratedDays: true, daysInMonth: true, feeLines: { select: { circuitId: true } } } },
      lines: { select: { circuitId: true } },
    },
  });

  // The first invoice of each deal: the one whose lines bill that deal's circuits
  // for the earliest month. It fixes the day billing started (the user's rule).
  const dealOfCircuit = new Map<string, string>();
  for (const p of society.pipelines) for (const c of p.siteSurvey?.circuits ?? []) dealOfCircuit.set(c.id, p.id);
  const firstInvoiceOf = new Map<string, FirstInvoice>();
  for (const inv of invoices) {
    const circuitIds = [...inv.calculation.feeLines.map((f) => f.circuitId), ...inv.lines.map((l) => l.circuitId)];
    const deals = new Set(circuitIds.flatMap((id) => (id && dealOfCircuit.has(id) ? [dealOfCircuit.get(id)!] : [])));
    for (const dealId of deals) {
      const have = firstInvoiceOf.get(dealId);
      if (!have || inv.calculation.period < have.period) {
        firstInvoiceOf.set(dealId, {
          number: inv.number,
          period: inv.calculation.period,
          ...firstBillingDay(inv.calculation.period, inv.calculation.proratedDays, inv.calculation.daysInMonth),
        });
      }
    }
  }

  const today = new Date();
  const rootCtx = { branchId: `society:${society.id}` };
  const root: Branch = {
    id: rootCtx.branchId,
    kind: "society",
    title: "Society",
    name: society.name,
    steps: [
      step(rootCtx, { slot: "societyCreated", label: "Society added to FirsThing", date: society.createdAt, recordOnly: null }),
      ...(society.closedAt
        ? [step(rootCtx, { slot: "societyClosed", label: "Society rejected / terminated", date: society.closedAt, note: society.closedReason })]
        : []),
    ],
    children: [],
  };

  const lines = [...new Set([...society.engagements.map((e) => e.serviceLine), ...society.pipelines.map((p) => p.serviceLine)])];
  for (const line of lines) {
    const engagement = society.engagements.find((e) => e.serviceLine === line) ?? null;
    const lineCtx = { branchId: `line:${society.id}:${line}` };
    const deals = society.pipelines.filter((p) => p.serviceLine === line);
    const lineBranch: Branch = {
      id: lineCtx.branchId,
      kind: "line",
      title: "Service line",
      name: SERVICE_LINE_LABEL[line] ?? line,
      meta: `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`,
      steps: [
        step(lineCtx, {
          slot: "enrolled",
          label: `Enrolled in ${SERVICE_LINE_LABEL[line] ?? line}`,
          date: engagement?.createdAt ?? null,
          expected: true,
          note: engagement ? null : "No enrolment on record — the deal was opened without one.",
          edit: engagement ? { field: "engagement.createdAt", entityId: engagement.id } : null,
        }),
      ],
      children: [],
    };

    for (const p of deals) {
      lineBranch.children.push(buildDeal(p, firstInvoiceOf.get(p.id) ?? null));
    }

    const lineInvoices = invoices.filter((i) => i.calculation.serviceLine === line);
    if (lineInvoices.length > 0) {
      const billCtx = { branchId: `billing:${society.id}:${line}` };
      const first = lineInvoices[0].calculation.period;
      const last = lineInvoices[lineInvoices.length - 1].calculation.period;
      const paid = lineInvoices.filter((i) => i.status === "paid").length;
      const overdue = lineInvoices.filter((i) => ["overdue", "warning", "suspended"].includes(i.status));
      lineBranch.children.push({
        id: billCtx.branchId,
        kind: "billing",
        title: "Billing",
        name: `${monthLabel(first)} → ${monthLabel(last)}`,
        meta: `${lineInvoices.length} ${lineInvoices.length === 1 ? "month" : "months"} · ${paid} paid${overdue.length ? ` · ${overdue.length} overdue` : ""}`,
        steps: lineInvoices.map((i) => {
          const status = invoiceStatus(i.status, i.dueDate, today);
          return {
            id: `${billCtx.branchId}:${i.id}`,
            slot: `invoice:${i.id}`,
            label: `${monthLabel(i.calculation.period)} invoiced`,
            date: i.issueDate,
            note: `Invoice ${i.number} · due ${formatDate(i.dueDate)}${i.releasedAt ? "" : " · not yet released to the society"}`,
            chip: status,
          };
        }),
        children: [],
      });
    }
    root.children.push(lineBranch);
  }

  return { society: { id: society.id, name: society.name, status: society.status, closedAt: society.closedAt }, root };
}

function invoiceStatus(status: string, due: Date, today: Date): Step["chip"] {
  if (status === "paid") return { text: "Paid", tone: "ok" };
  if (status === "suspended") return { text: "Suspended", tone: "bad" };
  if (status === "overdue" || status === "warning") return { text: "Overdue", tone: "warn" };
  if (status === "attached") return { text: "Not released", tone: "neu" };
  return due.getTime() < today.getTime() ? { text: "Overdue", tone: "warn" } : { text: "Due", tone: "info" };
}

type DealRow = {
  id: string;
  serviceLine: string;
  dealScope: string | null;
  stage: string;
  createdAt: Date;
  meetingDate: Date;
  proposalDecidedAt: Date | null;
  proposalOutcome: string | null;
  surveyAssignedAt: Date | null;
  closedLostAt: Date | null;
  closedLostReason: string | null;
  scheduledEvents: { startAt: Date }[];
  siteSurvey: {
    createdAt: Date;
    circuits: {
      id: string;
      location: string | null;
      lightType: string;
      createdAt: Date;
      voidedAt: Date | null;
      voidReason: string | null;
      representedLightCount: number;
      meteredLightCount: number;
      demos: DemoRow[];
    }[];
  } | null;
  demoReports: { version: number; sharedAt: Date | null }[];
  offers: { id: string; version: number; status: string; issuedAt: Date | null; respondedAt: Date | null }[];
  agreement: { id: string; preparedAt: Date; printedAt: Date | null; notarizedAt: Date | null; signedAt: Date | null; uploadedAt: Date | null } | null;
  contract: { id: string; status: string; activatedAt: Date | null; termStart: Date; termEnd: Date; terminatedOn: Date | null; terminationReason: string | null } | null;
  installationProject: {
    batches: { submittedAt: Date | null; review: { reviewedAt: Date } | null }[];
    certificate: { id: string; signedAt: Date; billingStartDate: Date } | null;
  } | null;
};

type DemoRow = {
  id: string;
  sequence: number;
  meteredLightCount: number;
  savingsPct: number | null;
  rejected: boolean;
  rejectionReason: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  meterInstalledAt: Date | null;
  meterSkipped: boolean;
  preFrom: Date | null;
  preTo: Date | null;
  replacementAssignedAt: Date | null;
  lightReplacementDate: Date | null;
  postFrom: Date | null;
  postTo: Date | null;
  gatePasses: { kind: string; status: string; submittedAt: Date; approvedAt: Date | null }[];
  scheduledEvents: { startAt: Date }[];
};

function buildDeal(p: DealRow, firstInvoice: FirstInvoice | null): Branch {
  const ctx = { branchId: `deal:${p.id}` };
  const surveyed = surveyHappenedAt({ visitAt: p.scheduledEvents[0]?.startAt ?? null, rowCreatedAt: p.siteSurvey?.createdAt ?? null });
  const closedLost = p.stage === "closed_lost";
  const agreed = p.proposalOutcome === "agreed";

  const steps: Step[] = [
    step(ctx, { slot: "lead", label: "Lead logged", date: p.createdAt, expected: true, edit: { field: "pipeline.createdAt", entityId: p.id } }),
    step(ctx, { slot: "meeting", label: "Demo meeting held", date: p.meetingDate, expected: true, futureOk: true, edit: { field: "pipeline.meetingDate", entityId: p.id } }),
    step(ctx, {
      slot: "decided",
      label: "Proposal decided",
      date: p.proposalDecidedAt,
      expected: true,
      chip: p.proposalOutcome && p.proposalOutcome !== "agreed" ? { text: p.proposalOutcome === "declined" ? "Declined" : "Undecided", tone: "neu" } : null,
      edit: p.proposalDecidedAt ? { field: "pipeline.proposalDecidedAt", entityId: p.id } : null,
    }),
  ];
  if (agreed || p.surveyAssignedAt || p.siteSurvey) {
    steps.push(
      step(ctx, { slot: "surveyAssigned", label: "Survey assigned", date: p.surveyAssignedAt, expected: true, edit: p.surveyAssignedAt ? { field: "pipeline.surveyAssignedAt", entityId: p.id } : null }),
      step(ctx, {
        slot: "survey",
        label: "Site survey done",
        date: p.siteSurvey ? surveyed.date : null,
        expected: true,
        borrowed: p.siteSurvey && !p.scheduledEvents[0] ? "No survey visit was booked, so this is the date the survey record was opened." : null,
        edit: p.siteSurvey ? { field: "pipeline.survey", entityId: p.id } : null,
      }),
    );
  }

  const children: Branch[] = (p.siteSurvey?.circuits ?? []).map((c) => {
    const cctx = { branchId: `circuit:${c.id}` };
    const live = c.demos.filter((d) => !d.voidedAt);
    return {
      id: cctx.branchId,
      kind: "circuit" as const,
      title: "Circuit",
      name: c.location?.trim() || c.lightType,
      meta: `${c.representedLightCount.toLocaleString("en-IN")} lights represented · ${live.length} ${live.length === 1 ? "demo" : "demos"}`,
      struck: c.voidedAt ? `Removed ${formatDate(c.voidedAt)}${c.voidReason ? ` — ${c.voidReason}` : ""}` : null,
      steps: [step(cctx, { slot: "candidate", label: "Circuit recorded at the survey", date: c.createdAt, recordOnly: "Stamped when the circuit was entered." })],
      children: c.demos.map(demoBranch),
    };
  });

  const after: Step[] = [];
  const report = p.demoReports[0];
  if (report?.sharedAt) {
    after.push(
      step(ctx, {
        slot: "reportShared",
        label: "Demo report shared with the society",
        date: report.sharedAt,
        chip: { text: `Version ${report.version}`, tone: "neu" },
        recordOnly: "Stamped when the report was shared in the app, so it is not checked against the deal's dates.",
      }),
    );
  }
  const offer = p.offers[0];
  if (offer) {
    after.push(
      step(ctx, { slot: "offerIssued", label: `Offer issued${offer.version > 1 ? ` (version ${offer.version})` : ""}`, date: offer.issuedAt, expected: true, edit: { field: "offer.issuedAt", entityId: offer.id } }),
    );
    if (offer.respondedAt || ["accepted", "rejected", "countered"].includes(offer.status)) {
      after.push(
        step(ctx, {
          slot: "offerResponded",
          label: offer.status === "accepted" ? "Offer accepted" : offer.status === "rejected" ? "Offer rejected" : "Offer answered",
          date: offer.respondedAt,
          expected: true,
          edit: offer.respondedAt ? { field: "offer.respondedAt", entityId: offer.id } : null,
        }),
      );
    }
  }
  const a = p.agreement;
  if (a) {
    const chainEdit = (field: "agreement.preparedAt" | "agreement.printedAt" | "agreement.notarizedAt" | "agreement.signedAt" | "agreement.uploadedAt", d: Date | null) =>
      d ? { field, entityId: p.id } : null;
    after.push(
      step(ctx, {
        slot: "agreement",
        label: a.signedAt ? "Agreement signed" : "Agreement in preparation",
        date: a.signedAt ?? a.preparedAt,
        expected: true,
        chain: [
          { slot: "agreementPrepared", label: "Prepared", date: a.preparedAt, edit: chainEdit("agreement.preparedAt", a.preparedAt) },
          { slot: "agreementPrinted", label: "Printed", date: a.printedAt, edit: chainEdit("agreement.printedAt", a.printedAt) },
          { slot: "agreementNotarized", label: "Notarised", date: a.notarizedAt, edit: chainEdit("agreement.notarizedAt", a.notarizedAt) },
          { slot: "agreementSigned", label: "Signed", date: a.signedAt, edit: chainEdit("agreement.signedAt", a.signedAt) },
          { slot: "agreementUploaded", label: "Scan uploaded", date: a.uploadedAt, edit: chainEdit("agreement.uploadedAt", a.uploadedAt) },
        ],
      }),
    );
  }
  const k = p.contract;
  if (k) {
    if (k.activatedAt) {
      after.push(
        step(ctx, {
          slot: "contractActivated",
          label: "Contract activated",
          date: k.activatedAt,
          // Activated at signing or on the first billing day — not tied to the
          // installation days listed after it (society-chronology.ts).
          outsideSequence: true,
          note: "Checked against the signature and the day billing starts, not against installation.",
          edit: { field: "contract.activatedAt", entityId: p.id },
        }),
      );
    }
  }
  const proj = p.installationProject;
  if (proj) {
    const worked = proj.batches.flatMap((b) => [b.submittedAt, b.review?.reviewedAt ?? null]).filter((d): d is Date => d !== null).sort((x, y) => x.getTime() - y.getTime());
    if (worked.length > 0) {
      after.push(
        step(ctx, {
          slot: "installWork",
          label: "Installation days worked and approved",
          date: worked[0],
          end: worked[worked.length - 1],
          note: `${proj.batches.length} ${proj.batches.length === 1 ? "day" : "days"} — correct them on the installation page.`,
        }),
      );
    }
    if (proj.certificate) {
      after.push(
        step(ctx, { slot: "certificate", label: "Installation certificate signed", date: proj.certificate.signedAt, edit: { field: "certificate.signedAt", entityId: p.id } }),
        step(ctx, {
          slot: "billingStart",
          label: "Billing starts",
          date: proj.certificate.billingStartDate,
          futureOk: true,
          note: "The day after the certificate — it moves with it.",
        }),
      );
    }
  }
  // The term starts when billing does, so it reads after the certificate.
  if (k) {
    after.push(
      step(ctx, { slot: "term", label: "Contract term", date: k.termStart, end: k.termEnd, futureOk: true, edit: { field: "contract.term", entityId: p.id } }),
    );
  }
  if (firstInvoice) {
    after.push(
      step(ctx, {
        slot: FIRST_INVOICE_SLOT,
        label: "Billing started (first invoice)",
        date: firstInvoice.startsOn,
        chip: { text: "Source of truth", tone: "info" },
        note: `Invoice ${firstInvoice.number} for ${monthLabel(firstInvoice.period)} — ${firstInvoice.basis}. Every step before billing is checked back from this day.`,
      }),
    );
  }
  if (k?.terminatedOn) {
    after.push(step(ctx, { slot: "terminated", label: "Contract ended (last served day)", date: k.terminatedOn, note: k.terminationReason }));
  }
  if (closedLost) {
    after.push(step(ctx, { slot: "closedLost", label: "Closed — lost", date: p.closedLostAt, chip: { text: "Closed – lost", tone: "neu" }, note: p.closedLostReason }));
  }

  const billing = proj?.certificate?.billingStartDate ?? null;
  return {
    id: ctx.branchId,
    kind: "deal",
    title: "Deal",
    name: dealLabel(p.serviceLine, p.dealScope),
    meta: closedLost ? "Closed — lost" : billing ? `Billing since ${formatDate(billing)}` : stageWords(p.stage),
    steps,
    children,
    after,
  };
}

function stageWords(stage: string): string {
  const words: Record<string, string> = {
    lead: "Lead",
    survey_pending: "Survey and demos",
    demo_reported: "Demo reported",
    offered: "Offer out",
    agreed: "Agreed",
    installation: "Installing",
    active_billing: "Billing",
  };
  return words[stage] ?? stage;
}

function demoBranch(d: DemoRow): Branch {
  const ctx = { branchId: `demo:${d.id}` };
  const install = d.gatePasses.find((g) => g.kind === "demo_install");
  const completion = d.gatePasses.find((g) => g.kind === "demo_install_completion");
  const booked = d.scheduledEvents[0]?.startAt ?? null;
  const steps: Step[] = [
    step(ctx, {
      slot: "meter",
      label: "Meter installed",
      date: d.meterInstalledAt,
      expected: !d.meterSkipped,
      note: d.meterSkipped ? "Run without a meter — its days were typed in." : null,
      edit: d.meterInstalledAt ? { field: "demo.meterInstalledAt", entityId: d.id } : null,
    }),
    step(ctx, { slot: "pre", label: "Before-installation readings", date: d.preFrom, end: d.preTo, expected: true, edit: { field: "demo.pre", entityId: d.id } }),
    step(ctx, {
      slot: "replacementAssigned",
      label: "Replacement assigned to a crew",
      date: d.replacementAssignedAt,
      expected: true,
      note: booked ? `Replacement day booked for ${formatDate(booked)}.` : null,
      edit: d.replacementAssignedAt ? { field: "demo.replacementAssignedAt", entityId: d.id } : null,
    }),
    step(ctx, {
      slot: "replaced",
      label: "Lights replaced",
      date: d.lightReplacementDate,
      expected: true,
      edit: d.lightReplacementDate ? { field: "demo.lightReplacementDate", entityId: d.id } : null,
    }),
    step(ctx, { slot: "post", label: "After-installation readings", date: d.postFrom, end: d.postTo, expected: true, edit: { field: "demo.post", entityId: d.id } }),
  ];
  if (install || completion) {
    const passes = [install, completion].filter((g) => !!g);
    steps.push(
      step(ctx, {
        slot: "gatePasses",
        label: passes.every((g) => g.status === "approved") ? "Gate passes approved" : "Gate passes submitted",
        date: passes.map((g) => g.approvedAt ?? g.submittedAt).sort((x, y) => y.getTime() - x.getTime())[0],
        chip: { text: "Recorded, no event date", tone: "neu" },
        recordOnly: "Install and completion passes are stamped when entered, so they are not checked against the demo's dates.",
      }),
    );
  }
  return {
    id: ctx.branchId,
    kind: "demo",
    title: `Demo ${d.sequence}`,
    name: `${d.meteredLightCount} lights`,
    // A rejected demo takes no part in the benchmark, but its dates happened:
    // it stays checked. Only a removed one is struck through (soft delete).
    meta: d.rejected
      ? `Rejected — ${d.rejectionReason ?? "no reason recorded"}`
      : d.savingsPct != null
        ? `Saving ${d.savingsPct.toFixed(2)}%`
        : null,
    struck: d.voidedAt ? `Removed ${formatDate(d.voidedAt)}${d.voidReason ? ` — ${d.voidReason}` : ""}` : null,
    steps,
    children: [],
  };
}
