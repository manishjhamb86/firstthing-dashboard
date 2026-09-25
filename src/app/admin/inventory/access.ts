import { redirect } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";

/** Inventory pages: field or pipeline staff — the same rule the actions apply. */
export async function requireInventoryPage() {
  await requireAdminPage();
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions.includes("manage_survey") || admin.permissions.includes("manage_pipeline"))) redirect("/admin");
  return admin;
}
