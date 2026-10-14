/**
 * Whether this deployment is the STAGING environment, not production
 * (2026-10-14, user-asked: "hard to ignore... no matter what page he is
 * on" — people repeatedly mistook stage for live and the other way round,
 * and made real changes on the wrong one).
 *
 * Derived from `AUTH_URL` alone — no new env var, no manual step on either
 * box (the user's explicit correction: "the differentiation should be
 * based on environment only. there should not be any manual
 * interventions"). `AUTH_URL` is already a hard requirement for login to
 * work at all on a self-hosted deploy (CLAUDE.md's own standing rule), and
 * it already differs correctly per environment — stage's is
 * `https://stage.firsthing.earth`, production's `https://www.firsthing.earth`
 * — so there is nothing new to configure or forget to set.
 */
export function isStageEnvironment(): boolean {
  const url = process.env.AUTH_URL;
  if (!url) return false;
  try {
    return new URL(url).hostname.startsWith("stage.");
  } catch {
    return false;
  }
}
