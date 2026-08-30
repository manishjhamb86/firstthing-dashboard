import { redirect } from "next/navigation";

// Merged into Electricity (customer-portal revamp, 2026-08-29). The
// per-meter detail page below this route stays.
export default function PortalMetersRedirect() {
  redirect("/portal/electricity");
}
