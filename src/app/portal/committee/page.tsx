import { redirect } from "next/navigation";

// Committee became Society admin — members AND their module access in one
// place (customer-portal revamp, 2026-08-29). The old URL keeps working.
export default function PortalCommitteeRedirect() {
  redirect("/portal/admin");
}
