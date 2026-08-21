import { permanentRedirect } from "next/navigation";

// /admin/monitoring split into two tabs (2026-08-21). Kept as a redirect so
// a bookmark or a link in an old log still lands somewhere real.
export default function MonitoringMoved() {
  permanentRedirect("/admin/demo-monitoring");
}
