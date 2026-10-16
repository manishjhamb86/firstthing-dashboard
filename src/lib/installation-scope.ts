/**
 * How much of a deal's surveyed light count the FULL installation crew
 * still has to plan for (2026-10-17, user-asked).
 *
 * A metered demo circuit's own lights are replaced as part of standing the
 * demo up — before the full crew ever arrives — so asking the crew to plan
 * those same lights again would double them: once already done at the demo,
 * once more in the day-by-day plan. `CircuitDevice.replacementCount` is the
 * one place a real replacement is recorded (set together with `replacedAt`
 * once the engineer records it — this reads the same field the "kept, not
 * replaced" deduction already reads, not a second source of truth for the
 * same fact).
 */

export type ReplacedDevice = { replacementCount: number | null };
export type CircuitWithDevices = { devices: ReplacedDevice[] };

/** Summed across every circuit this deal's survey produced. */
export function alreadyInstalledCount(circuits: readonly CircuitWithDevices[]): number {
  return circuits.reduce((total, c) => total + c.devices.reduce((n, d) => n + (d.replacementCount ?? 0), 0), 0);
}

/**
 * What the full installation still has to cover — never negative, since a
 * circuit's own replaced count can exceed the raw survey tally when the
 * survey undercounted (the two are corrected independently, same as any
 * other figure in this codebase that can drift).
 */
export function remainingInstallationScope(surveyedLightCount: number, alreadyInstalled: number): number {
  return Math.max(0, surveyedLightCount - alreadyInstalled);
}
