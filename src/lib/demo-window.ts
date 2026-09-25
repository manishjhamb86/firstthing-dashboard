// The demo periods (2026-09-25, user-specified). "Say the pre-install window
// was 11-08-2026 to 15-08-2026 and the post-install period 18-08-2026 to
// 24-08-2026: the pre-install report consists of readings between 11 and 15
// August, the post-install report of 11–15 and 18–24 August only. Nothing
// before or after or in between. Strictly the mentioned periods."
//
// Each window is independent: set, it is the ONLY source of its days; unset,
// the old rule stands (pre = after the meter until the replacement, post =
// after the replacement). Readings outside both are monitoring — kept, shown
// in the readings list, never in a demo figure or a demo report.

import { classifyDay } from "@/lib/circuit-load";

export type DemoWindowFields = {
  meterInstalledAt: Date | null;
  lightReplacementDate: Date | null;
  preDemoFrom: Date | null;
  preDemoTo: Date | null;
  postDemoFrom: Date | null;
  postDemoTo: Date | null;
};

export type DemoPhase = "pre" | "post" | "outside";

const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const within = (d: Date, from: Date, to: Date) => day(d) >= day(from) && day(d) <= day(to);

export function hasPreWindow(c: Pick<DemoWindowFields, "preDemoFrom" | "preDemoTo">): boolean {
  return c.preDemoFrom !== null && c.preDemoTo !== null;
}
export function hasPostWindow(c: Pick<DemoWindowFields, "postDemoFrom" | "postDemoTo">): boolean {
  return c.postDemoFrom !== null && c.postDemoTo !== null;
}

/** Which demo figure a stored day belongs to, if any. */
export function demoPhase(date: Date, c: DemoWindowFields): DemoPhase {
  if (hasPreWindow(c) && within(date, c.preDemoFrom!, c.preDemoTo!)) return "pre";
  if (hasPostWindow(c) && within(date, c.postDemoFrom!, c.postDemoTo!)) return "post";
  if (!c.meterInstalledAt) return "outside";
  const p = classifyDay(date, c.meterInstalledAt, c.lightReplacementDate);
  if (p === "pre_install" && !hasPreWindow(c)) return "pre";
  if (p === "post_install" && !hasPostWindow(c)) return "post";
  return "outside";
}

export type DemoWindowInput = { preFrom: string; preTo: string; postFrom: string; postTo: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parse = (s: string) => (ISO.test(s) ? new Date(`${s}T00:00:00Z`) : null);

/** Why the windows cannot be saved as entered, or null. A window is set with both its dates or neither. */
export function refuseDemoWindows(
  w: DemoWindowInput,
  c: { meterInstalledAt: Date | null; lightReplacementDate: Date | null },
  now = new Date(),
): string | null {
  const [pf, pt, qf, qt] = [w.preFrom, w.preTo, w.postFrom, w.postTo].map((s) => (s ? parse(s) : null));
  if ((w.preFrom && !pf) || (w.preTo && !pt) || (w.postFrom && !qf) || (w.postTo && !qt)) return "Enter the dates in full.";
  if (!!pf !== !!pt) return "Give the pre-installation period both a start and an end.";
  if (!!qf !== !!qt) return "Give the post-installation period both a start and an end.";
  const today = day(now);
  if (pf && pt) {
    if (day(pf) > day(pt)) return "The pre-installation period ends before it starts.";
    if (c.meterInstalledAt && day(pf) <= day(c.meterInstalledAt)) return "The pre-installation period starts on or before the meter went in — it has to start the day after.";
    if (c.lightReplacementDate && day(pt) >= day(c.lightReplacementDate)) return "The pre-installation period has to end before the lights were replaced.";
    if (day(pt) > today) return "The pre-installation period cannot end in the future.";
  }
  if (qf && qt) {
    if (day(qf) > day(qt)) return "The post-installation period ends before it starts.";
    if (!c.lightReplacementDate) return "Record the light replacement before setting the post-installation period.";
    if (day(qf) <= day(c.lightReplacementDate)) return "The post-installation period starts on or before the replacement day — it has to start the day after.";
    if (day(qt) > today) return "The post-installation period cannot end in the future.";
  }
  if (pt && qf && day(pt) >= day(qf)) return "The pre-installation period has to end before the post-installation one starts.";
  return null;
}

export function windowDates(w: DemoWindowInput) {
  return {
    preDemoFrom: w.preFrom ? parse(w.preFrom) : null,
    preDemoTo: w.preTo ? parse(w.preTo) : null,
    postDemoFrom: w.postFrom ? parse(w.postFrom) : null,
    postDemoTo: w.postTo ? parse(w.postTo) : null,
  };
}
