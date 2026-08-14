import { signOut } from "@/lib/auth";

// Where a page sends a viewer whose token still verifies but whose account no
// longer backs it (deleted, deactivated, or authority revoked — see
// src/lib/admin-permissions.ts).
//
// Redirecting such a viewer straight to /login does NOT work and is worth
// spelling out, because the first version of this fix did exactly that and
// span the browser into ERR_TOO_MANY_REDIRECTS: proxy.ts still sees a
// perfectly valid JWT, so it bounces /login back to the role's home, which
// re-runs the page check, which redirects to /login again. The session has to
// actually END. This route clears the cookie, after which the proxy agrees
// the viewer is signed out and /login renders normally.
//
// A Route Handler (not a Server Component) because only handlers and actions
// may write cookies — a render pass cannot. It sits under /api, which
// proxy.ts's matcher deliberately excludes, so it can never be caught in the
// loop it exists to break.
export async function GET() {
  await signOut({ redirectTo: "/login?reason=session-ended" });
}
