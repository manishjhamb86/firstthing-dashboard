// The three reads the founders' page needs that nowhere else in the app
// loads (2026-10-22, docs/research/reports/Founder operations dashboard.md
// §"Portfolio already loads most of it; five pieces are missing"). Meetings
// and the shared notification feed are read straight from their existing
// homes (YourTasks, src/lib/notifications.ts) — nothing new to build there.
//
// Each loader is cache()-wrapped per request, the same convention every
// other shared read in this codebase follows, so the page's own render and
// any card that needs the same rows again cannot issue the query twice.

import { cache } from "react";
import { db } from "@/lib/db";
import { isSettled, settledTotal } from "@/lib/payment";
import {
  INVOICE_PAST_45_DAYS,
  invoiceLateness,
  demoReplacementLateness,
  demoWindowLateness,
  type LatenessResult,
} from "@/lib/lateness";
import { evaluateDayGateChain, type BatchGateInput, type DayGateStatus } from "@/lib/installation-gate";
import { reviewUrgency } from "@/lib/demo-result-review";
import { circuitLabelOf } from "@/lib/circuit-label";

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type OverdueInvoiceRow = {
  invoiceId: string;
  number: string;
  societyId: string;
  societyName: string;
  outstanding: number;
  lateness: LatenessResult;
};

export type PaymentSummary = {
  receivedThisMonth: number;
  outstandingTotal: number;
  /** Zoho's own default aging buckets, so the founders can cross-check against the source system. */
  buckets: { notYetDue: number; d1to15: number; d16to30: number; d31to45: number; over45: number };
  overdueInvoices: OverdueInvoiceRow[];
  /** Collapsed to one row per society, oldest-first (the app's own rule once 14 identical reminders made a bell meaningless). */
  topOverdueSocieties: Array<{ societyId: string; societyName: string; count: number; outstanding: number; oldestDays: number }>;
  /** Kept separate rather than merged in — retail sales are a different ledger (RetailInvoice), and whether they belong in these totals is a founder call, not a default. */
  retail: { unpaidCount: number; owed: number };
};

export const paymentSummary = cache(async (now: Date = new Date()): Promise<PaymentSummary> => {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [invoices, receivedRows, retail] = await Promise.all([
    db.billingInvoice.findMany({
      where: { voidedAt: null, releasedAt: { not: null }, status: { not: "paid" } },
      select: {
        id: true,
        number: true,
        amount: true,
        dueDate: true,
        payments: { select: { amount: true, tdsAmount: true } },
        calculation: { select: { society: { select: { id: true, name: true } } } },
      },
    }),
    db.payment.findMany({
      where: { confirmedAsOf: { gte: monthStart } },
      select: { amount: true, tdsAmount: true },
    }),
    db.retailInvoice.findMany({
      where: { voidedAt: null, paid: false },
      select: { total: true, advanceAmount: true },
    }),
  ]);

  const receivedThisMonth = settledTotal(receivedRows);

  const buckets = { notYetDue: 0, d1to15: 0, d16to30: 0, d31to45: 0, over45: 0 };
  let outstandingTotal = 0;
  const overdueInvoices: OverdueInvoiceRow[] = [];
  const bySociety = new Map<string, { societyName: string; count: number; outstanding: number; oldestDays: number }>();

  for (const inv of invoices) {
    const settled = settledTotal(inv.payments);
    const outstanding = Math.max(0, Math.round((inv.amount - settled) * 100) / 100);
    if (outstanding <= 0) continue;
    outstandingTotal += outstanding;

    const daysPastDue = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysPastDue < 1) buckets.notYetDue += outstanding;
    else if (daysPastDue <= 15) buckets.d1to15 += outstanding;
    else if (daysPastDue <= 30) buckets.d16to30 += outstanding;
    else if (daysPastDue <= INVOICE_PAST_45_DAYS) buckets.d31to45 += outstanding;
    else buckets.over45 += outstanding;

    const lateness = invoiceLateness({ dueDate: inv.dueDate, settled: isSettled(inv.amount, inv.payments), now });
    if (!lateness) continue;
    const societyId = inv.calculation.society.id;
    overdueInvoices.push({
      invoiceId: inv.id,
      number: inv.number,
      societyId,
      societyName: inv.calculation.society.name,
      outstanding,
      lateness,
    });
    const existing = bySociety.get(societyId);
    if (existing) {
      existing.count += 1;
      existing.outstanding += outstanding;
      existing.oldestDays = Math.max(existing.oldestDays, daysPastDue);
    } else {
      bySociety.set(societyId, { societyName: inv.calculation.society.name, count: 1, outstanding, oldestDays: daysPastDue });
    }
  }

  overdueInvoices.sort((a, b) => b.outstanding - a.outstanding);
  const topOverdueSocieties = [...bySociety.entries()]
    .map(([societyId, v]) => ({ societyId, ...v }))
    .sort((a, b) => b.oldestDays - a.oldestDays)
    .slice(0, 5);

  const retailOwed = retail.reduce((n, r) => n + Math.max(0, r.total - (r.advanceAmount ?? 0)), 0);

  return {
    receivedThisMonth,
    outstandingTotal: Math.round(outstandingTotal * 100) / 100,
    buckets,
    overdueInvoices,
    topOverdueSocieties,
    retail: { unpaidCount: retail.length, owed: Math.round(retailOwed * 100) / 100 },
  };
});

// ---------------------------------------------------------------------------
// Installations
// ---------------------------------------------------------------------------

export type InstallationRow = {
  projectId: string;
  pipelineId: string;
  societyName: string;
  installedCount: number;
  contractedCount: number;
  nextPlannedDay: { day: number; startAt: Date } | null;
  /** Only the days whose gate is actually holding something up — most projects contribute none. */
  heldDays: Array<{ day: number; status: DayGateStatus; reason: string | null; deadline: Date | null }>;
};

export const installationBoard = cache(async (now: Date = new Date()): Promise<InstallationRow[]> => {
  const projects = await db.installationProject.findMany({
    where: { certificate: null },
    include: {
      pipeline: { select: { id: true, society: { select: { name: true } } } },
      plannedDays: { orderBy: { day: "asc" } },
      batches: { orderBy: { day: "asc" }, include: { review: { select: { reviewedAt: true } } } },
    },
  });

  return projects.map((project) => {
    const gateInputs = (bs: typeof project.batches): BatchGateInput[] =>
      bs.map((b) => ({ id: b.id, areaKey: b.areaKey, state: b.state, submittedAt: b.submittedAt, reviewedAt: b.review?.reviewedAt ?? null }));

    const gates = evaluateDayGateChain({
      now,
      days: project.plannedDays.map((d) => {
        const previous = project.batches.filter((b) => b.day === d.day - 1);
        const skipApplies = !!project.gateSkipBatchId && previous.some((b) => b.id === project.gateSkipBatchId);
        return { day: d.day, startAt: d.startAt, previousBatches: gateInputs(previous), skipUsedForDay: skipApplies };
      }),
    });

    const heldDays = [...gates.entries()]
      .filter(([, g]) => g.status === "blocked" || g.status === "at_risk" || g.status === "late_approved")
      .map(([day, g]) => ({ day, status: g.status, reason: g.reason, deadline: g.deadline }));

    const daysWithBatch = new Set(project.batches.map((b) => b.day));
    const nextPlanned = project.plannedDays.find((d) => !daysWithBatch.has(d.day)) ?? null;

    return {
      projectId: project.id,
      pipelineId: project.pipelineId,
      societyName: project.pipeline.society.name,
      installedCount: project.batches.reduce((n, b) => n + b.installedCount, 0),
      contractedCount: project.contractedLightCount,
      nextPlannedDay: nextPlanned ? { day: nextPlanned.day, startAt: nextPlanned.startAt } : null,
      heldDays,
    };
  });
});

// ---------------------------------------------------------------------------
// Demos
// ---------------------------------------------------------------------------

export type DemoReviewRow = {
  reviewId: string;
  circuitId: string;
  societyName: string;
  circuitLabel: string;
  urgency: ReturnType<typeof reviewUrgency>;
};

export type DemoDelayRow = {
  demoId: string;
  circuitId: string;
  societyName: string;
  circuitLabel: string;
  lateness: LatenessResult;
  kind: "pre_window" | "post_window" | "replacement";
};

export type DemoBoard = {
  reviews: DemoReviewRow[];
  delays: DemoDelayRow[];
  stepCounts: { preWindow: number; awaitingReplacement: number; postWindow: number; reviewOpen: number };
};

export const demoBoard = cache(async (now: Date = new Date()): Promise<DemoBoard> => {
  const [openReviews, demos] = await Promise.all([
    db.demoResultReview.findMany({
      where: { state: "open", circuit: { voidedAt: null } },
      include: { circuit: { select: { id: true, location: true, lightType: true, society: { select: { name: true } } } } },
      orderBy: [{ occurrence: "desc" }, { raisedAt: "asc" }],
    }),
    db.circuitDemo.findMany({
      where: { voidedAt: null, rejected: false, circuit: { voidedAt: null } },
      select: {
        id: true,
        circuitId: true,
        preFrom: true,
        preInstallBaseline: true,
        postFrom: true,
        savingsPct: true,
        replacementAssignedAt: true,
        lightReplacementDate: true,
        circuit: { select: { location: true, lightType: true, society: { select: { name: true } } } },
      },
    }),
  ]);

  const reviews: DemoReviewRow[] = openReviews.map((r) => ({
    reviewId: r.id,
    circuitId: r.circuit.id,
    societyName: r.circuit.society.name,
    circuitLabel: circuitLabelOf(r.circuit.location, r.circuit.lightType),
    urgency: reviewUrgency({ raisedAt: r.raisedAt, occurrence: r.occurrence, now }),
  }));

  const delays: DemoDelayRow[] = [];
  let preWindow = 0;
  let awaitingReplacement = 0;
  let postWindow = 0;

  for (const d of demos) {
    const preOpen = d.preFrom !== null && d.preInstallBaseline === null;
    const postOpen = d.postFrom !== null && d.savingsPct === null;
    const awaitingReplacementNow = d.replacementAssignedAt !== null && d.lightReplacementDate === null;

    if (preOpen) {
      preWindow += 1;
      const l = demoWindowLateness({ openedAt: d.preFrom as Date, now });
      if (l) delays.push({ demoId: d.id, circuitId: d.circuitId, societyName: d.circuit.society.name, circuitLabel: circuitLabelOf(d.circuit.location, d.circuit.lightType), lateness: l, kind: "pre_window" });
    }
    if (postOpen) {
      postWindow += 1;
      const l = demoWindowLateness({ openedAt: d.postFrom as Date, now });
      if (l) delays.push({ demoId: d.id, circuitId: d.circuitId, societyName: d.circuit.society.name, circuitLabel: circuitLabelOf(d.circuit.location, d.circuit.lightType), lateness: l, kind: "post_window" });
    }
    if (awaitingReplacementNow) {
      awaitingReplacement += 1;
      const l = demoReplacementLateness({ assignedAt: d.replacementAssignedAt as Date, now });
      if (l) delays.push({ demoId: d.id, circuitId: d.circuitId, societyName: d.circuit.society.name, circuitLabel: circuitLabelOf(d.circuit.location, d.circuit.lightType), lateness: l, kind: "replacement" });
    }
  }

  delays.sort((a, b) => (a.lateness.tone === b.lateness.tone ? 0 : a.lateness.tone === "red" ? -1 : 1));

  return {
    reviews,
    delays,
    stepCounts: { preWindow, awaitingReplacement, postWindow, reviewOpen: openReviews.length },
  };
});
