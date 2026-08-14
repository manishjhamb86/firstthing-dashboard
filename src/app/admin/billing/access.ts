import type { AdminPermission } from "@prisma/client";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

export type BillingActor = {
  id: string;
  email: string;
  name: string | null;
  permissions: AdminPermission[];
};

// Same explicit-boolean discriminant as the readings area's own gate: without
// a literal-typed field, TypeScript widens both branches and `gate.actor`
// reads as possibly-undefined at every call site.
export type AccessGate = { ok: false; error: string } | { ok: true; actor: BillingActor };

// These gates REFUSE BY RETURNING, never by throwing. A Server Action that
// throws reaches the browser as a bare 500 with its message replaced by an
// opaque digest in a production build — so the operator is told nothing at
// all. That defect was found and fixed in MS-07's presign action; this area
// is built the right way round from the start.
function refuse(reason: string, actor: BillingActor | null, gate: string): { ok: false; error: string } {
  logger.warn("billing.access_refused", { actorId: actor?.id ?? null, gate });
  return { ok: false, error: reason };
}

async function actorOrNull(): Promise<BillingActor | null> {
  const admin = await resolveAdmin();
  return admin ? { id: admin.id, email: admin.email, name: admin.name, permissions: admin.permissions } : null;
}

/**
 * PER-01 — ops. The same technical proxy this codebase settled at MS-03:
 * there is no third permission marker for the ops lead, and a real PER-01
 * account holds every back-office permission, so requiring both stands in
 * for "PER-01 specifically".
 *
 * Owns: running the month, applying a review's outcome, uploading the Zoho
 * invoice, recording a payment, granting an extension.
 */
export async function requireBillingOps(): Promise<AccessGate> {
  const actor = await actorOrNull();
  if (!actor) return refuse("Your session is no longer valid. Sign in again.", null, "ops");
  const isOps =
    actor.permissions.includes("manage_pipeline") && actor.permissions.includes("manage_survey");
  if (!isOps) {
    return refuse(
      "Billing operations is an operations lead action. It needs both pipeline and field-survey authority.",
      actor,
      "ops",
    );
  }
  return { ok: true, actor };
}

/**
 * PER-08 — the accountant, and only the accountant (FEAT-054-AC-4).
 *
 * The gate exists so that something other than the process which produced a
 * figure decides whether it reaches a society (CON-33). Holding every ops
 * permission therefore does NOT confer it: an account that can run the month
 * must not be able to release its own output. That is the whole content of
 * "release is unavailable to any user who is not PER-08 — including PER-01",
 * and it is the one place in this codebase where the ops proxy deliberately
 * buys nothing.
 */
export async function requireAccountant(): Promise<AccessGate> {
  const actor = await actorOrNull();
  if (!actor) return refuse("Your session is no longer valid. Sign in again.", null, "accountant");
  if (!actor.permissions.includes("release_billing")) {
    return refuse(
      "Releasing a month to a society is the accountant's act (CON-33). Ops permissions do not confer it.",
      actor,
      "accountant",
    );
  }
  return { ok: true, actor };
}

/** Read access to the billing area — either hat opens it. */
export async function requireBillingReader(): Promise<AccessGate> {
  const actor = await actorOrNull();
  if (!actor) return refuse("Your session is no longer valid. Sign in again.", null, "reader");
  const canRead =
    actor.permissions.includes("manage_pipeline") || actor.permissions.includes("release_billing");
  if (!canRead) return refuse("You don't have access to billing.", actor, "reader");
  return { ok: true, actor };
}

/** True when the viewer may release — used to decide what a screen offers. */
export function canRelease(actor: BillingActor): boolean {
  return actor.permissions.includes("release_billing");
}

/** True when the viewer is ops — used to decide what a screen offers. */
export function isOps(actor: BillingActor): boolean {
  return actor.permissions.includes("manage_pipeline") && actor.permissions.includes("manage_survey");
}
