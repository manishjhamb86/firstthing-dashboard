import { redirect } from "next/navigation";
import { STALE_SESSION_EXIT, resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

/**
 * Who may use the field app (docs/engineering/19-field-app.md §9 Q2).
 *
 * Provisional answer, 2026-09-29: any internal account holding
 * `manage_survey` — the permission field work already runs on everywhere in
 * the back office (Field work, inspections, gate passes, scanning stock). By
 * TEAM_PERMISSIONS that is engineering, inspection and operations. Sales and
 * finance are sent to the back office.
 *
 * Read from the row, never the token — the rule every gate here follows.
 */
export async function requireFieldPage() {
  const admin = await resolveAdmin();
  if (!admin) redirect(STALE_SESSION_EXIT);
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("field.access_refused", { userId: admin.id, team: admin.team });
    redirect("/admin");
  }
  return admin;
}
