import { resolveTheme } from "@/lib/resolve-theme";
import { auth } from "@/lib/auth";
import { AdminNavClient } from "./admin-nav-client";

// Minimal, not the approved theme system's full shell (05a-theme-system.md
// §3.7's component list) — that's a larger lift than this milestone needs.
// What IS adopted: the chrome tokens (§3.2b) and the theme switcher itself,
// since a switcher with nothing to switch is not actually a switcher. Split
// into this server shell (theme lookup only) + a client component for the
// mobile toggle interaction — see admin-nav-client.tsx for why a collapse
// toggle replaced an earlier flex-wrap-only approach.
export async function AdminNav() {
  const [theme, session] = await Promise.all([resolveTheme(), auth()]);
  const showPipeline = session?.user.adminPermissions?.includes("manage_pipeline") ?? false;
  return <AdminNavClient theme={theme} showPipeline={showPipeline} />;
}
