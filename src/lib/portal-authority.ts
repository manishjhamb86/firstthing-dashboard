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
