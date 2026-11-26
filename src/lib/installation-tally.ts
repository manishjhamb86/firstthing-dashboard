/**
 * Where an installation stands against its contracted scope (2026-11-26,
 * user-caught). A day's PLAN is only a plan: a crew planning 300 lights that
 * installs 100 has not left 200 owed on that day — the next day's plan is a
 * fresh plan. So a day that has been logged counts what was INSTALLED, and
 * only the days not yet logged count what is planned. Summing every day's
 * plan read as "1,653 planned … 503 over" on a project that had installed
 * 1,151 of 1,200.
 */

export type TallyDay = { plannedCount: number; installedCount: number | null };

export type InstallationTally = {
  /** Lights installed in the logged days. */
  installed: number;
  /** Lights replaced on the demo circuit before the crew arrived. */
  demo: number;
  /** installed + demo — every light actually in. */
  totalInstalled: number;
  daysLogged: number;
  /** Days with no log yet, and what they plan. */
  daysToGo: number;
  plannedToGo: number;
  /** totalInstalled + plannedToGo, against contracted. */
  expectedTotal: number;
  contracted: number;
  /** expectedTotal − contracted: positive over, negative short. */
  gap: number;
  /** contracted − totalInstalled, never negative. */
  stillToInstall: number;
};

export function installationTally(days: readonly TallyDay[], demo: number, contracted: number): InstallationTally {
  let installed = 0;
  let daysLogged = 0;
  let daysToGo = 0;
  let plannedToGo = 0;
  for (const d of days) {
    if (d.installedCount === null) {
      daysToGo += 1;
      plannedToGo += d.plannedCount;
    } else {
      daysLogged += 1;
      installed += d.installedCount;
    }
  }
  const totalInstalled = installed + demo;
  const expectedTotal = totalInstalled + plannedToGo;
  return {
    installed,
    demo,
    totalInstalled,
    daysLogged,
    daysToGo,
    plannedToGo,
    expectedTotal,
    contracted,
    gap: expectedTotal - contracted,
    stillToInstall: Math.max(0, contracted - totalInstalled),
  };
}

/** One sentence for the Days card. */
export function describeTally(t: InstallationTally): string {
  const n = (x: number) => x.toLocaleString("en-IN");
  const parts = [`${n(t.installed)} installed in ${t.daysLogged} logged day${t.daysLogged === 1 ? "" : "s"}`];
  if (t.demo > 0) parts.push(`${n(t.demo)} on the demo circuit`);
  if (t.daysToGo > 0) parts.push(`${n(t.plannedToGo)} planned for ${t.daysToGo} day${t.daysToGo === 1 ? "" : "s"} still to go`);
  const lhs = parts.length > 1 ? `${parts.join(" + ")} = ${n(t.expectedTotal)}` : parts[0];
  const verdict = t.gap === 0 ? "reconciled" : t.gap > 0 ? `${n(t.gap)} over` : `${n(-t.gap)} short`;
  return `${lhs} against ${n(t.contracted)} contracted — ${verdict}`;
}
