import type { PortalAuthority, PortalGrant } from "@prisma/client";

/**
 * Which portal modules a member may use — the whole decision in one pure
 * module, so the sidebar, every page gate and the admin editor cannot
 * disagree about what a grant means. Same split as portal-authority.ts:
 * the Server Actions are thin shells around functions a unit test can hold.
 *
 * Two rules live here and nowhere else:
 *
 *  1. The office-bearer holds EVERY grant, implicitly. Computed, never
 *     stored: if it were rows on the profile, transferring the designation
 *     (GATE-04) would strand full access on the old holder and the new one
 *     would start locked out of their own society.
 *  2. tickets_manage implies tickets_view. Raising a request and then being
 *     unable to see it is not a permission model, it is a bug with a schema.
 */

export const ALL_PORTAL_GRANTS: PortalGrant[] = [
  "electricity",
  "water_tanks",
  "documents",
  "inventory",
  "tickets_view",
  "tickets_manage",
  "society_admin",
];

/** The grants the office-bearer's access editor offers per member. */
export const GRANT_META: { id: PortalGrant; label: string; note: string }[] = [
  { id: "electricity", label: "Electricity", note: "meters, consumption and savings" },
  { id: "water_tanks", label: "Water tanks", note: "levels and sensor health" },
  { id: "documents", label: "Documents", note: "reports, invoices, agreement" },
  { id: "inventory", label: "Inventory", note: "what is deployed on site" },
  { id: "tickets_view", label: "Tickets — view", note: "see requests and their status" },
  { id: "tickets_manage", label: "Tickets — manage", note: "raise and update requests" },
  { id: "society_admin", label: "Society admin", note: "see members and their access" },
];

/** The grants in force for a member, with both implication rules applied. */
export function effectiveGrants(
  authority: PortalAuthority,
  stored: PortalGrant[],
): Set<PortalGrant> {
  if (authority === "office_bearer") return new Set(ALL_PORTAL_GRANTS);
  const grants = new Set(stored);
  if (grants.has("tickets_manage")) grants.add("tickets_view");
  return grants;
}

export function hasGrant(
  viewer: { role: PortalAuthority; grants: PortalGrant[] },
  grant: PortalGrant,
): boolean {
  return effectiveGrants(viewer.role, viewer.grants).has(grant);
}

export type GrantCheck = { ok: true } | { ok: false; error: string };

/**
 * May `actor` edit `target`'s grants? The editing act itself is the
 * office-bearer's alone — society_admin lets a member SEE who has what,
 * not change it, the same read/act split as tickets_view/tickets_manage.
 */
export function checkGrantEdit(
  actor: { id: string; role: PortalAuthority; societyId: string | null },
  target: { id: string; societyId: string | null; portalAuthority: PortalAuthority | null },
): GrantCheck {
  if (actor.role !== "office_bearer") {
    return { ok: false, error: "Only the office-bearer can change what members can access." };
  }
  if (!actor.societyId || actor.societyId !== target.societyId) {
    // INV-05 — a request cannot reach across societies, whatever id it carries.
    return { ok: false, error: "That account does not belong to your society." };
  }
  if (target.portalAuthority === "office_bearer") {
    return {
      ok: false,
      error:
        "The office-bearer always has full access — transfer the designation instead of editing grants.",
    };
  }
  if (!target.portalAuthority) {
    return { ok: false, error: "That account is not an active portal member." };
  }
  return { ok: true };
}

/** Refuse values that are not real grants — a select is client HTML, not truth. */
export function sanitizeGrants(values: string[]): PortalGrant[] | null {
  const out: PortalGrant[] = [];
  for (const v of values) {
    if (!(ALL_PORTAL_GRANTS as string[]).includes(v)) return null;
    out.push(v as PortalGrant);
  }
  return [...new Set(out)];
}
