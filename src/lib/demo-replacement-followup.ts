/**
 * A partial light replacement (2026-10-06, user-asked): "the demo had 50
 * lights to be replaced, but the user was able to replace say 47 lights,
 * rest 3 lights were not replaced because of unaccessibility of area... then
 * user will mark 47 lights installed, 3 lights left with society, and option
 * either he will visit again some other day to finish install, or the
 * society agreed to install the pending 3 lights themselves and inform."
 *
 * Pure rules only — the write path lives in demo-step-core.ts
 * (recordDemoReplacementAs) and the completion action in
 * src/app/portal/electricity/followup-actions.ts.
 */

export type RemainingLine = { lineId: string; deviceTypeName: string; remainingCount: number };

export type PartialLine = { lineId: string; deviceTypeName: string; lineCount: number; replacedCount: number };

/** Which lines of a submitted replacement are genuinely partial — fewer replaced than the line holds. */
export function remainingLinesOf(lines: PartialLine[]): RemainingLine[] {
  return lines
    .filter((l) => l.replacedCount < l.lineCount)
    .map((l) => ({ lineId: l.lineId, deviceTypeName: l.deviceTypeName, remainingCount: l.lineCount - l.replacedCount }));
}

/**
 * A partial replacement with no stated plan is a gap, not a convenience — the
 * crew and the society both need to know who is coming back for the rest.
 * Refuses in words rather than silently accepting an incomplete record.
 */
export function refuseMissingFollowUp(
  remaining: RemainingLine[],
  followUp: { plan: "field_revisit" | "society_completes"; reason: string } | null | undefined,
): string | null {
  if (remaining.length === 0) return null; // nothing partial — nothing to decide
  if (!followUp) {
    const total = remaining.reduce((n, r) => n + r.remainingCount, 0);
    return `${total} light${total === 1 ? "" : "s"} ${total === 1 ? "was" : "were"} left unreplaced — say who is finishing them and why, before saving.`;
  }
  if (!followUp.reason.trim()) return "Say why the remaining lights could not be replaced.";
  return null;
}

/** A follow-up already settled (completed or voided) cannot be completed again. */
export function refuseCompleteFollowUp(state: { completedAt: Date | null; voidedAt: Date | null }): string | null {
  if (state.voidedAt) return "This record was withdrawn — it is no longer open.";
  if (state.completedAt) return "This was already marked complete.";
  return null;
}
