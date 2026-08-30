import { redirect } from "next/navigation";

// The Lighting and Meters tabs merged into Electricity (customer-portal
// revamp, 2026-08-29) — one story, one page. The old URL keeps working.
export default function PortalLightingRedirect() {
  redirect("/portal/electricity");
}
