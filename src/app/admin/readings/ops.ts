import { requireAdminPermission } from "@/lib/admin-permissions";

type AdminSession = Awaited<ReturnType<typeof requireAdminPermission>>;

// An explicit boolean discriminant, not a `"error" in ops` check. Without a
// literal-typed field to discriminate on, TypeScript widens both branches and
// every `ops.session` reads as possibly-undefined at each of its ~25 uses.
export type OpsGate = { ok: false; error: string } | { ok: true; session: AdminSession };

// FEAT-043-AC-4 / FEAT-044-AC-4 / FEAT-045-AC-4 — every action in this area
// is PER-01's. Same technical proxy this codebase settled at MS-03 and has
// applied at every site since: there is no third permission marker for ops,
// and a real PER-01 account holds every back-office permission, so requiring
// both stands in for "PER-01 specifically". A pure field account
// (manage_survey alone) can read the readings but cannot ingest them.
export async function requireOps(): Promise<OpsGate> {
  const session = await requireAdminPermission("manage_pipeline");
  if (!session.user.adminPermissions?.includes("manage_survey")) {
    return {
      ok: false,
      error:
        "Reading ingest is an operations lead action. It needs both pipeline and field-survey authority.",
    };
  }
  return { ok: true, session };
}
