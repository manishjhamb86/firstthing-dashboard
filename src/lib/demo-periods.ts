/**
 * A demo's periods (2026-09-26, user-specified): "Each demo report will
 * contain only those readings that fall in the demo period. For the pre
 * install report the pre install period start to end, and for the post
 * install report both the pre install period and the demo post install
 * period." Strictly the chosen days — nothing before, between or after.
 *
 * Periods belong to the DEMO, not the circuit: every demo on a circuit walks
 * its own steps and is measured over its own dates.
 */

export type DemoPeriods = {
  preFrom: Date | null;
  preTo: Date | null;
  postFrom: Date | null;
  postTo: Date | null;
};

export type DemoDates = {
  meterInstalledAt: Date | null;
  lightReplacementDate: Date | null;
};

export type DemoPhase = "pre" | "post";

export const dayMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const within = (d: Date, from: Date, to: Date) => dayMs(d) >= dayMs(from) && dayMs(d) <= dayMs(to);

export function hasPrePeriod(p: Pick<DemoPeriods, "preFrom" | "preTo">): boolean {
  return p.preFrom !== null && p.preTo !== null;
}
export function hasPostPeriod(p: Pick<DemoPeriods, "postFrom" | "postTo">): boolean {
  return p.postFrom !== null && p.postTo !== null;
}

/** Which period a day falls in, or null — no fallback to the old whole-span rule. */
export function periodOfDay(date: Date, p: DemoPeriods): DemoPhase | null {
  if (hasPrePeriod(p) && within(date, p.preFrom!, p.preTo!)) return "pre";
  if (hasPostPeriod(p) && within(date, p.postFrom!, p.postTo!)) return "post";
  return null;
}

/** Every calendar day of a period, at UTC midnight. */
export function daysOf(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = dayMs(from); t <= dayMs(to); t += 86_400_000) out.push(new Date(t));
  return out;
}

export type PeriodInput = { preFrom: string; preTo: string; postFrom: string; postTo: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parse = (s: string) => (ISO.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export function periodDates(w: PeriodInput): DemoPeriods {
  return {
    preFrom: w.preFrom ? parse(w.preFrom) : null,
    preTo: w.preTo ? parse(w.preTo) : null,
    postFrom: w.postFrom ? parse(w.postFrom) : null,
    postTo: w.postTo ? parse(w.postTo) : null,
  };
}

/**
 * Why the periods cannot be saved as entered, or null. A period is set with
 * both its dates or neither. The ordering is the demo's own:
 *   meter day < pre period < replacement day < post period, none in the future.
 */
export function refuseDemoPeriods(w: PeriodInput, c: DemoDates, now = new Date()): string | null {
  const [pf, pt, qf, qt] = [w.preFrom, w.preTo, w.postFrom, w.postTo].map((s) => (s ? parse(s) : null));
  if ((w.preFrom && !pf) || (w.preTo && !pt) || (w.postFrom && !qf) || (w.postTo && !qt)) return "Enter the dates in full.";
  if (!!pf !== !!pt) return "Give the pre-installation period both a start and an end.";
  if (!!qf !== !!qt) return "Give the post-installation period both a start and an end.";
  const today = dayMs(now);
  if (pf && pt) {
    if (!c.meterInstalledAt) return "Record the meter install before choosing the pre-installation period.";
    if (dayMs(pf) > dayMs(pt)) return "The pre-installation period ends before it starts.";
    if (dayMs(pf) <= dayMs(c.meterInstalledAt)) return "The pre-installation period starts on or before the meter went in — it has to start the day after.";
    if (c.lightReplacementDate && dayMs(pt) >= dayMs(c.lightReplacementDate)) return "The pre-installation period has to end before the lights were replaced.";
    if (dayMs(pt) > today) return "The pre-installation period cannot end in the future.";
  }
  if (qf && qt) {
    if (dayMs(qf) > dayMs(qt)) return "The post-installation period ends before it starts.";
    if (!c.lightReplacementDate) return "Record the light replacement before choosing the post-installation period.";
    if (dayMs(qf) <= dayMs(c.lightReplacementDate)) return "The post-installation period starts on or before the replacement day — it has to start the day after.";
    if (dayMs(qt) > today) return "The post-installation period cannot end in the future.";
  }
  if (pt && qf && dayMs(pt) >= dayMs(qf)) return "The pre-installation period has to end before the post-installation one starts.";
  return null;
}

/** A sensible starting suggestion for the period picker — never saved on its own. */
export function suggestedPeriod(
  phase: DemoPhase,
  c: DemoDates,
  now = new Date(),
): { from: string; to: string } | null {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const today = dayMs(now);
  if (phase === "pre") {
    if (!c.meterInstalledAt) return null;
    const from = dayMs(c.meterInstalledAt) + 86_400_000;
    const to = c.lightReplacementDate ? dayMs(c.lightReplacementDate) - 86_400_000 : today;
    return to >= from ? { from: iso(from), to: iso(Math.min(to, today)) } : null;
  }
  if (!c.lightReplacementDate) return null;
  const from = dayMs(c.lightReplacementDate) + 86_400_000;
  return today >= from ? { from: iso(from), to: iso(Math.min(from + 6 * 86_400_000, today)) } : null;
}
