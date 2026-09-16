/**
 * Which Gemini model reads a document, and what to do when its quota is gone.
 *
 * The key on stage is a FREE-TIER key, and the free tier caps each model at
 * 20 requests a DAY (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
 * `quotaValue: "20"` — read off the live refusal, 2026-09-16). The refusal
 * also says "retry in 55s", which is the per-minute window and is misleading
 * for a daily cap: no amount of waiting inside the day helps, and Retry
 * failed identically every time the user pressed it.
 *
 * Two things follow. The quota is PER MODEL, so a refused read moves to the
 * next model in the list — every model here answers the same JSON-schema
 * request. And the real fix is a billed key: pay-as-you-go pricing on a flash
 * model is a fraction of a rupee per invoice, and it lifts the daily cap
 * entirely. `GEMINI_MODELS` in the environment overrides the
 * list (comma-separated, first is preferred).
 */
export const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];

export function geminiModels(): string[] {
  const raw = process.env.GEMINI_MODELS?.trim();
  if (!raw) return DEFAULT_MODELS;
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export type QuotaKind = "quota" | "none";

/**
 * Whether a Gemini error is a quota refusal at all. The Interactions endpoint
 * strips the QuotaFailure details, so the per-day and per-minute cases are
 * NOT distinguishable from the SDK error (checked live, 2026-09-16: the body
 * carries only the message and "retry in 58s"). Every 429 is therefore
 * treated the same way: try the next model, whose quota is its own.
 */
export function quotaKind(raw: string): QuotaKind {
  return /429|RESOURCE_EXHAUSTED|too_many_requests|quota/i.test(raw) ? "quota" : "none";
}

/** Run `attempt` against each model in turn; a quota refusal moves on, anything else is the answer. */
export async function withModelFallback<T>(
  attempt: (model: string) => Promise<T>,
  onSkip?: (model: string, raw: string) => void,
): Promise<T> {
  const models = geminiModels();
  let lastErr: unknown;
  for (const model of models) {
    try {
      return await attempt(model);
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      if (quotaKind(raw) !== "quota") throw err;
      onSkip?.(model, raw);
    }
  }
  throw lastErr;
}
