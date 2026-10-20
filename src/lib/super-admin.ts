/**
 * A handful of operations-only settings are genuinely narrower than "anyone
 * who manages admins" — live external credentials (Google Calendar's
 * domain-wide-delegation key, Zoho's OAuth secret, AWS SES) plus a
 * data-correction switch that bypasses an ordinary safety gate. Bound to one
 * named account rather than a permission, per the user's own instruction
 * (2026-10-20) — not a general pattern, so this stays a short-lived,
 * narrowly-named helper rather than a new permission type.
 */
export const SUPER_ADMIN_EMAIL = "yogesh@firsthing.earth";

export function isSuperAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
