import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ROLE_HOME, isRole } from "@/lib/roles";

// Route-prefix -> roles allowed. `null` would mean any authenticated role.
const ROUTE_ROLES: Record<string, string[] | null> = {
  "/admin": ["admin"],
  // The field app (2026-09-29): internal accounts only. Which ones may use
  // it (manage_survey) is decided per page from the row, in field/access.ts.
  "/field": ["admin"],
  "/portal": ["office_bearer", "committee", "manager"],
};

function matchRoute(pathname: string): string[] | null | undefined {
  for (const prefix of Object.keys(ROUTE_ROLES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return ROUTE_ROLES[prefix];
    }
  }
  return undefined; // not a protected prefix — left alone
}

// Host-based split (2026-10-02, user-specified): one app, two public faces.
// `app.firsthing.earth` (and every other host — dev, stage, a bare IP) keeps
// everything this file already protects below. `www.firsthing.earth` (and
// the bare apex, in case DNS sends either there) gets ONLY the marketing
// homepage, whatever the requested path — so a stray `/admin` typed on the
// public marketing domain lands on the homepage, not on a login redirect
// that leaks this app's own route structure to a visitor. Rewritten, not
// redirected, so the address bar still reads the marketing host.
//
// This is the app-side half of the split. The DNS for `www.`/`app.` and the
// server's reverse-proxy config are a separate, explicit infra step — not
// done by this change (see PROJECT_CONTEXT.md). Until that cutover, the page
// is reachable directly at `/marketing` on any host (e.g. for a stage
// preview), and this rewrite is inert everywhere it currently runs.
const MARKETING_HOSTS = new Set(["www.firsthing.earth", "firsthing.earth"]);

function hostOf(req: { headers: Headers }): string {
  return (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
}

// NOTE: this is an OPTIMISTIC check only (Next's own docs: "it should not be
// your only line of defense... security checks should be performed as close
// as possible to your data source" — GATE-03/05 in 09-architecture.md §11).
// auth() here reads the JWT session cookie only, no DB round trip. Every
// Route Handler and Server Action added from MS-02 onward MUST independently
// call auth() and check role/ownership; a matcher change here can silently
// stop covering a path.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  if (MARKETING_HOSTS.has(hostOf(req)) && pathname !== "/marketing") {
    return NextResponse.rewrite(new URL("/marketing", req.url));
  }

  if (pathname === "/login") {
    if (req.auth?.user && isRole(role)) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
    return NextResponse.next();
  }

  const requiredRoles = matchRoute(pathname);
  if (requiredRoles === undefined) return NextResponse.next();

  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (requiredRoles !== null && (!role || !requiredRoles.includes(role))) {
    return NextResponse.redirect(new URL(isRole(role) ? ROLE_HOME[role] : "/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml)$).*)",
  ],
};
