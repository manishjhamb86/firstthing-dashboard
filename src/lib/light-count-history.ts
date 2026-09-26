import { benchmarkCeiling, type Exclusion } from "@/lib/circuit-load";
/**
 * A circuit's light count over time, told as stages (2026-09-26, user-asked).
 *
 * The count a circuit is billed on can change after its demo: lights added
 * or removed are recorded as a rescale event (INV-07), and the baseline is
 * rescaled with it. A society looking at "76 lights · 71.6% saved" cannot
 * tell that its demo ran on 55, or from when the 76 applies. So the history
 * is laid out as stages: the count at the demo and how long it held, then
 * each change with its own period, the last one marked current — each with
 * the baseline and the benchmark ceiling that count implies.
 *
 * Pure: the replay rules are benchmark-rescale's (voided events never count;
 * events apply in effective-date order), restated here as periods rather
 * than as a value at a date.
 */
import type { RescaleEvent } from "@/lib/benchmark-rescale";

export type LightStage = {
  lightCount: number;
  /** YYYY-MM-DD; null when the stage's start is not on record. */
  from: string | null;
  /** YYYY-MM-DD, the stage's last day; null while it still holds. */
  to: string | null;
  current: boolean;
  /** The pre-install draw of this many lights, kWh/day. */
  baseline: number | null;
  benchmarkPct: number | null;
  /** The most the circuit may draw and still meet the benchmark, kWh/day. */
  ceilingKwh: number | null;
  /** The demo's own period, when it falls in this stage. */
  demo: { from: string; to: string | null } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (d: Date) => iso(new Date(d.getTime() - 86_400_000));

export function lightCountStages(input: {
  /** The count on the circuit record now. */
  currentLightCount: number;
  /** The baseline as commissioned, before any rescale. */
  commissionedBaseline: number | null;
  benchmarkPct: number | null;
  /** The demo's period (first meter day → last post-install day). */
  demo: { from: Date; to: Date | null } | null;
  /** When the circuit's history starts if there was no demo in the system. */
  fallbackStart: Date | null;
  events: RescaleEvent[];
  today: Date;
  /** What stayed on the circuit unreplaced — the ceiling allows for it. */
  exclusion?: Exclusion;
}): LightStage[] {
  const live = input.events
    .filter((e) => !e.voidedAt)
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
  const ceiling = (baseline: number | null) =>
    baseline !== null && input.benchmarkPct !== null ? benchmarkCeiling(baseline, input.benchmarkPct, input.exclusion) : null;

  const start = input.demo?.from ?? input.fallbackStart;
  const stages: LightStage[] = [
    {
      lightCount: live[0]?.previousLightCount ?? input.currentLightCount,
      from: start ? iso(start) : null,
      to: null,
      current: false,
      baseline: input.commissionedBaseline,
      benchmarkPct: input.benchmarkPct,
      ceilingKwh: ceiling(input.commissionedBaseline),
      demo: input.demo ? { from: iso(input.demo.from), to: input.demo.to ? iso(input.demo.to) : null } : null,
    },
  ];
  for (const e of live) {
    stages[stages.length - 1].to = dayBefore(e.effectiveDate);
    stages.push({
      lightCount: e.newLightCount,
      from: iso(e.effectiveDate),
      to: null,
      current: false,
      baseline: e.rescaledBaseline,
      benchmarkPct: input.benchmarkPct,
      ceilingKwh: ceiling(e.rescaledBaseline),
      demo: null,
    });
  }

  // A change dated before the history's own start leaves an empty first stage.
  const kept = stages.filter((s) => !(s.from && s.to && s.to < s.from));
  const today = iso(input.today);
  for (const s of kept) s.current = (s.from === null || s.from <= today) && (s.to === null || s.to >= today);
  return kept;
}
