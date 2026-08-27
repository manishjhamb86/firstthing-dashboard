"use server";

// FEAT-014 AC-7/AC-8 — the demos a circuit's benchmark rests on, and the
// override when the agreed figure differs from what they measured.
//
// Every write here re-derives the benchmark from the demos that count, so the
// stored figure and the demos on record can never drift apart: rejecting a
// demo moves the benchmark in the same transaction that rejects it.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { deriveBenchmark, type DemoInput } from "@/lib/circuit-demos";

type Outcome = { ok?: true; error?: string };

/** Deciding what a circuit's benchmark is, is an operations-lead act. */
async function requireOps() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  const p = admin.permissions as string[];
  return p.includes("manage_survey") && p.includes("manage_pipeline") ? admin : null;
}

/**
 * Recompute and store the benchmark from whatever now counts.
 *
 * Runs inside the caller's transaction so a demo decision and the figure it
 * changes land together. An out-of-band result writes no benchmark, exactly
 * as FEAT-014-AC-5 has always required — a second demo that comes back at 41%
 * must not quietly become the number a society is billed on.
 */
async function resyncBenchmark(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], circuitId: string) {
  const circuit = await tx.circuit.findUnique({
    where: { id: circuitId },
    include: { demos: { orderBy: { sequence: "asc" } } },
  });
  if (!circuit) return;

  const demos: DemoInput[] = circuit.demos.map((d) => ({
    id: d.id,
    sequence: d.sequence,
    savingsPct: d.savingsPct,
    rejected: d.rejected,
  }));
  const derived = deriveBenchmark(
    demos,
    circuit.benchmarkOverridePct === null
      ? null
      : { pct: circuit.benchmarkOverridePct, reason: circuit.benchmarkOverrideReason ?? "" },
  );

  await tx.circuit.update({
    where: { id: circuitId },
    data: {
      benchmarkSavingsPct: derived.basis.kind === "override" ? derived.pct : derived.inBand ? derived.pct : null,
    },
  });
}

export async function recordCircuitDemo(input: {
  circuitId: string;
  meteredLightCount: number;
  preInstallBaseline: number;
  postInstallAverage: number;
  note?: string;
}): Promise<Outcome> {
  const admin = await requireOps();
  if (!admin) return { error: "Recording a demo is an operations-lead action." };
  const { meteredLightCount: n, preInstallBaseline: pre, postInstallAverage: post } = input;
  if (!(n > 0)) return { error: "Say how many lights this demo covered." };
  if (!(pre > 0)) return { error: "The pre-install average has to be a real figure." };
  if (post < 0) return { error: "The post-install average cannot be negative." };
  if (post >= pre) {
    return { error: `A demo that consumed ${post} after and ${pre} before saved nothing — check the two figures.` };
  }

  await db.$transaction(async (tx) => {
    const last = await tx.circuitDemo.findFirst({
      where: { circuitId: input.circuitId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    await tx.circuitDemo.create({
      data: {
        circuitId: input.circuitId,
        sequence: (last?.sequence ?? 0) + 1,
        meteredLightCount: n,
        preInstallBaseline: pre,
        postInstallAverage: post,
        // Verbatim, never rounded — AC-8.
        savingsPct: ((pre - post) / pre) * 100,
        note: input.note?.trim() || null,
      },
    });
    await resyncBenchmark(tx, input.circuitId);
  });

  logger.info("circuit.demo_recorded", { actorId: admin.id, circuitId: input.circuitId, metered: n });
  revalidatePath("/admin/societies", "layout");
  return { ok: true };
}

export async function setDemoRejected(input: {
  demoId: string;
  rejected: boolean;
  reason?: string;
}): Promise<Outcome> {
  const admin = await requireOps();
  if (!admin) return { error: "Deciding which demos count is an operations-lead action." };
  if (input.rejected && !input.reason?.trim()) {
    return { error: "Say why this demo is being rejected — a rejection with no stated reason cannot be reviewed later." };
  }
  const demo = await db.circuitDemo.findUnique({ where: { id: input.demoId } });
  if (!demo) return { error: "That demo is no longer on record." };

  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({
      where: { id: input.demoId },
      data: {
        rejected: input.rejected,
        rejectionReason: input.rejected ? input.reason!.trim() : null,
        decidedById: admin.id,
        decidedAt: new Date(),
      },
    });
    await resyncBenchmark(tx, demo.circuitId);
  });

  logger.info("circuit.demo_decided", {
    actorId: admin.id, circuitId: demo.circuitId, demoId: input.demoId, rejected: input.rejected,
  });
  revalidatePath("/admin/societies", "layout");
  return { ok: true };
}

export async function setBenchmarkOverride(input: {
  circuitId: string;
  pct: number | null;
  reason?: string;
}): Promise<Outcome> {
  const admin = await requireOps();
  if (!admin) return { error: "Overriding a benchmark is an operations-lead action." };
  if (input.pct !== null) {
    if (!Number.isFinite(input.pct) || input.pct <= 0 || input.pct >= 100) {
      return { error: "A savings benchmark is a percentage between 0 and 100." };
    }
    if (!input.reason?.trim()) {
      return { error: "Say why — an overridden benchmark with no stated reason is indistinguishable from a typo." };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.circuit.update({
      where: { id: input.circuitId },
      data: input.pct === null
        ? { benchmarkOverridePct: null, benchmarkOverrideReason: null, benchmarkOverrideById: null, benchmarkOverrideAt: null }
        : {
            benchmarkOverridePct: input.pct,
            benchmarkOverrideReason: input.reason!.trim(),
            benchmarkOverrideById: admin.id,
            benchmarkOverrideAt: new Date(),
          },
    });
    await resyncBenchmark(tx, input.circuitId);
  });

  logger.info("circuit.benchmark_override", {
    actorId: admin.id, circuitId: input.circuitId, pct: input.pct,
  });
  revalidatePath("/admin/societies", "layout");
  return { ok: true };
}
