/**
 * Staging access gate (2026-10-14, user-asked): "staging app/website to be
 * accessible by internal team only... allow only users with specific
 * cookies or session set manually on browser using any tool/extension."
 *
 * `STAGE_ACCESS_COOKIE`/`STAGE_ACCESS_SECRET` are set only in `zenovaa`'s
 * own `.env.local` (never production's, never committed) — the internal
 * team is given the cookie name and value out of band and sets it by hand
 * (a cookie-editor extension, devtools), never through any sign-in flow
 * this app provides. Production and local dev carry neither variable, so
 * this gate is inert everywhere except stage — matching `stage-banner.ts`'s
 * own "environment only, no manual per-deploy step beyond the one secret"
 * shape.
 */
export const STAGE_ACCESS_COOKIE = "ft_stage_access";

/** Whether staging is configured to require the access cookie at all. */
export function stageAccessRequired(): boolean {
  return !!process.env.STAGE_ACCESS_SECRET;
}

/** Whether the presented cookie value unlocks staging. */
export function stageAccessGranted(cookieValue: string | undefined): boolean {
  const secret = process.env.STAGE_ACCESS_SECRET;
  if (!secret) return true; // not configured — gate is off
  return cookieValue === secret;
}
