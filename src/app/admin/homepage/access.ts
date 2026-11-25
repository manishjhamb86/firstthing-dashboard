import { redirect } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";

/** The homepage's content is pipeline staff's — the same as Website enquiries. */
export async function requireHomepageStaff() {
  await requireAdminPage();
  const admin = await resolveAdmin();
  if (!admin || !admin.permissions.includes("manage_pipeline")) redirect("/admin");
  return admin;
}
