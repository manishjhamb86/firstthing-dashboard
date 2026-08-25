// Pure authorization decision for FEAT-108's binding act (GATE-04 + INV-05),
// factored out of src/app/portal/actions.ts specifically so it's testable
// without a live Next.js request context (auth()'s cookies()/headers() calls
// only work inside one) — this is what NFR-05's tenancy-scoping test suite
// (docs/backlog.yaml MS-02 exit criteria) actually exercises.
export type PortalActor = { id: string; role: string; societyId: string | null };
export type PortalTarget = { id: string; societyId: string | null; isActive: boolean } | null;

export type AuthorityCheckResult = { ok: true } | { ok: false; error: string; reason: string };

export function checkOfficeBearerTransfer(
  actor: PortalActor,
  target: PortalTarget,
): AuthorityCheckResult {
  // GATE-04: only the office-bearer may perform this binding act, checked
  // against the session's role — never trusted from the client, never
  // satisfied merely by a UI control not being rendered.
  if (actor.role !== "office_bearer") {
    return {
      ok: false,
      error: "Only the office-bearer can transfer this designation.",
      reason: "not_office_bearer",
    };
  }

  if (!actor.societyId) {
    return { ok: false, error: "No society on this account.", reason: "no_society" };
  }

  // INV-05: a request can only ever act on the actor's own society's data.
  if (!target || target.societyId !== actor.societyId || !target.isActive) {
    return { ok: false, error: "No such account in your society.", reason: "cross_tenant_or_missing" };
  }

  if (target.id === actor.id) {
    return {
      ok: false,
      error: "This account already holds the office-bearer designation.",
      reason: "already_holder",
    };
  }

  return { ok: true };
}

// ── FEAT-108-AC-9 — the society manages its own membership ────────────────
//
// "The society admin can add/delete users under their own society" (the
// user, 2026-08-25). The blueprint had every account act sitting with PER-01
// (AC-6, AC-8); this hands the routine part — a new committee member joins,
// an old one leaves — to the people who actually know when it happens.
//
// Three rules make it safe to give away, and all three live here rather than
// in the action, so they are testable without a request context:
//
//  · it is the OFFICE-BEARER's act, like every other binding one (GATE-04);
//  · the society is taken from the VIEWER, never from the request (INV-05) —
//    which is why these functions never accept a societyId argument;
//  · the office-bearer designation itself cannot be handed out here. There is
//    exactly one, and moving it is `checkOfficeBearerTransfer` above — a
//    "create another office-bearer" path would quietly produce two.

/** Authorities a society may hand out itself. Deliberately not office_bearer. */
export const SOCIETY_ASSIGNABLE = ["committee", "manager"] as const;
export type SocietyAssignable = (typeof SOCIETY_ASSIGNABLE)[number];

export function checkAccountCreate(
  actor: PortalActor,
  input: { email: string; authority: string; password: string },
): AuthorityCheckResult {
  if (actor.role !== "office_bearer") {
    return {
      ok: false,
      error: "Only the office-bearer can add an account for your society.",
      reason: "not_office_bearer",
    };
  }
  if (!actor.societyId) {
    return { ok: false, error: "No society on this account.", reason: "no_society" };
  }
  if (!(SOCIETY_ASSIGNABLE as readonly string[]).includes(input.authority)) {
    return {
      ok: false,
      // Naming the alternative matters: the office-bearer is not missing a
      // feature, they are looking at the wrong act.
      error: "A society account can be committee or manager. To move the office-bearer designation, use the transfer.",
      reason: "authority_not_assignable",
    };
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That is not a valid email address.", reason: "bad_email" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "The temporary password must be at least 8 characters.", reason: "weak_password" };
  }
  return { ok: true };
}

export function checkAccountDeactivate(
  actor: PortalActor,
  target: ({ id: string; societyId: string | null; isActive: boolean; portalAuthority?: string | null } | null),
): AuthorityCheckResult {
  if (actor.role !== "office_bearer") {
    return {
      ok: false,
      error: "Only the office-bearer can remove an account from your society.",
      reason: "not_office_bearer",
    };
  }
  if (!actor.societyId) {
    return { ok: false, error: "No society on this account.", reason: "no_society" };
  }
  if (!target || target.societyId !== actor.societyId || !target.isActive) {
    return { ok: false, error: "No such account in your society.", reason: "cross_tenant_or_missing" };
  }
  if (target.id === actor.id) {
    return {
      ok: false,
      // The admin screens carry the same guard for the same reason: an
      // account that removes itself leaves nobody able to undo it.
      error: "You cannot remove your own account. Transfer the office-bearer designation first.",
      reason: "self",
    };
  }
  if (target.portalAuthority === "office_bearer") {
    return {
      ok: false,
      error: "The office-bearer cannot be removed. Transfer the designation first, then remove the account.",
      reason: "office_bearer_target",
    };
  }
  return { ok: true };
}
