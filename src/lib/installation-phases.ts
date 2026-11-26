import { startOfDayUTC } from "@/lib/step-dates";
import { formatDate } from "@/lib/format-date";

/**
 * Installation phases (2026-11-26, user-specified). An installation is signed
 * off in 1 to 5 phases; each phase starts billing for the lights installed by
 * then. A phase is closed at a day: it holds every day after the previous
 * phase up to and including the day it was marked on, so the next planned day
 * falls into the next phase on its own. The last phase is the full
 * installation.
 *
 * Counts here are FULL-INSTALLATION lights (the logged days), cumulative. The
 * demo circuit's lights were installed before the crew arrived and are counted
 * once, in phase 1 — callers add them to phase 1's figure for display.
 */

export const MAX_PHASES = 5;

export type PhaseDay = {
  day: number;
  /** null while nothing has been logged for the day. */
  installedCount: number | null;
  /** The day's work date, once logged. */
  workedOn: Date | null;
};

export type PhaseRecord = {
  number: number;
  throughDay: number;
  signedAt: Date;
  /** Cumulative full-installation lights, when the sign-off states its own figure. */
  lightsOverride: number | null;
  isFinal: boolean;
};

/** The phase a day falls in: the first phase closed at or after it, else the open one. */
export function phaseOfDay(day: number, phases: readonly PhaseRecord[]): number {
  const sorted = [...phases].sort((a, b) => a.number - b.number);
  for (const p of sorted) if (day <= p.throughDay) return p.number;
  return sorted.length + 1;
}

/** Lights logged on every day up to and including `throughDay`. */
export function loggedThrough(days: readonly PhaseDay[], throughDay: number): number {
  return days.reduce((n, d) => n + (d.day <= throughDay && d.installedCount !== null ? d.installedCount : 0), 0);
}

export type PhaseFigures = PhaseRecord & {
  /** From the logged days. */
  derived: number;
  /** The figure in force: the override, else the logged days. */
  cumulative: number;
  /** Lights this phase added over the previous one. */
  added: number;
};

export function phaseFigures(days: readonly PhaseDay[], phases: readonly PhaseRecord[]): PhaseFigures[] {
  let prev = 0;
  return [...phases]
    .sort((a, b) => a.number - b.number)
    .map((p) => {
      const derived = loggedThrough(days, p.throughDay);
      const cumulative = p.lightsOverride ?? derived;
      const row = { ...p, derived, cumulative, added: cumulative - prev };
      prev = cumulative;
      return row;
    });
}

/** Why a phase cannot be signed off at `throughDay`, or null. */
export function refusePhaseSignoff(i: {
  phases: readonly PhaseRecord[];
  days: readonly PhaseDay[];
  throughDay: number;
  isFinal: boolean;
  signedOn: Date;
  today: Date;
  lightsOverride: number | null;
}): string | null {
  const sorted = [...i.phases].sort((a, b) => a.number - b.number);
  const last = sorted[sorted.length - 1] ?? null;
  if (last?.isFinal) return "The installation is already marked finished.";
  const number = sorted.length + 1;
  if (number > MAX_PHASES) return `An installation has at most ${MAX_PHASES} phases.`;
  if (number === MAX_PHASES && !i.isFinal) return `Phase ${MAX_PHASES} is the last one — mark the installation finished.`;
  const from = last?.throughDay ?? 0;
  // A phase may close on the same day as the one before when that phase
  // billed fewer lights than its days hold (Prateek Laurel: 2,000 of 2,445
  // signed off at day 7) — the rest of those lights are this phase's.
  const prevFigures = last ? phaseFigures(i.days, sorted).at(-1)! : null;
  const leftover = prevFigures ? prevFigures.derived - prevFigures.cumulative : 0;
  if (i.throughDay < from || (i.throughDay === from && leftover <= 0)) {
    return `Day ${i.throughDay} is already in phase ${last!.number}.`;
  }

  const inPhase = i.days.filter((d) => d.day > from && d.day <= i.throughDay);
  if (inPhase.length === 0 && leftover <= 0) return "There is no day in this phase.";
  const unlogged = inPhase.find((d) => d.installedCount === null);
  if (unlogged) return `Day ${unlogged.day} has no work logged — log it, or delete it, before closing the phase.`;
  if (i.isFinal) {
    const after = i.days.filter((d) => d.day > i.throughDay);
    if (after.length > 0) {
      const logged = after.filter((d) => d.installedCount !== null);
      return logged.length > 0
        ? `Day ${logged[logged.length - 1].day} has work logged after day ${i.throughDay} — mark the installation finished on the last logged day.`
        : `${after.length} planned day${after.length === 1 ? " comes" : "s come"} after day ${i.throughDay} — delete ${after.length === 1 ? "it" : "them"} if the installation is finished.`;
    }
  }

  const today = startOfDayUTC(i.today).getTime();
  const signed = startOfDayUTC(i.signedOn).getTime();
  if (signed > today) return "A phase cannot be signed off in the future.";
  const lastWork = (inPhase.length ? inPhase : i.days.filter((d) => d.day === i.throughDay)).map((d) => d.workedOn).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastWork && signed < startOfDayUTC(lastWork).getTime()) {
    return `The sign-off (${formatDate(i.signedOn)}) cannot come before day ${i.throughDay}'s work (${formatDate(lastWork)}).`;
  }
  if (last && signed < startOfDayUTC(last.signedAt).getTime()) {
    return `Phase ${number} cannot be signed off before phase ${last.number} (${formatDate(last.signedAt)}).`;
  }

  if (i.lightsOverride !== null) {
    if (!Number.isInteger(i.lightsOverride) || i.lightsOverride <= 0) return "The lights installed must be a positive whole number.";
    const prev = last ? phaseFigures(i.days, sorted).at(-1)!.cumulative : 0;
    if (i.lightsOverride <= prev) return `The lights installed so far must be more than phase ${last!.number}'s ${prev}.`;
  }
  return null;
}

/**
 * Why a recorded phase's count cannot be corrected to `lightsOverride`
 * (2026-11-26): it must stay above the phase before and below the phase
 * after, so the phases still read in order. null = back to the logged days.
 */
export function refusePhaseCountCorrection(i: {
  days: readonly PhaseDay[];
  phases: readonly PhaseRecord[];
  number: number;
  lightsOverride: number | null;
}): string | null {
  const sorted = [...i.phases].sort((a, b) => a.number - b.number);
  const idx = sorted.findIndex((p) => p.number === i.number);
  if (idx < 0) return "That phase is no longer on record.";
  if (i.lightsOverride !== null && (!Number.isInteger(i.lightsOverride) || i.lightsOverride <= 0)) {
    return "The lights installed must be a positive whole number.";
  }
  const next = sorted.map((p, k) => (k === idx ? { ...p, lightsOverride: i.lightsOverride } : p));
  const figs = phaseFigures(i.days, next);
  const me = figs[idx];
  if (idx > 0 && me.cumulative <= figs[idx - 1].cumulative) {
    return `Phase ${i.number} must have more lights than phase ${figs[idx - 1].number}'s ${figs[idx - 1].cumulative}.`;
  }
  if (idx < figs.length - 1 && me.cumulative >= figs[idx + 1].cumulative) {
    return `Phase ${i.number} must have fewer lights than phase ${figs[idx + 1].number}'s ${figs[idx + 1].cumulative}.`;
  }
  return null;
}
