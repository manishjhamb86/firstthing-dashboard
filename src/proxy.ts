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

// Host-based split (2026-10-02, user-specified, corrected the same day): ONE
// app, reachable whole on EITHER host. `www.firsthing.earth` and
// `app.firsthing.earth` both carry the full site — `/admin`, `/portal`,
// `/login`, `/field` all keep working exactly as below, on either host.
// The only thing that differs by host is the bare `/`: on the marketing
// hosts it serves the marketing homepage instead of this file's usual root
// behaviour (src/app/page.tsx's session-based redirect). Rewritten, not
// redirected, so the address bar still reads the host the visitor used.
//
// (First cut of this rewrote EVERY path on the marketing hosts to the
// homepage, which would have broken `www.firsthing.earth/admin` — corrected
// per the user's own worked example the same day it shipped.)
//
// This is the app-side half of the split. The DNS for `www.`/`app.` and the
// server's reverse-proxy config are a separate, explicit infra step — not
// done by this change (see PROJECT_CONTEXT.md).
//
// `stage.firsthing.earth` is listed too (2026-10-02, user-asked): it is the
// one host actually reachable before that DNS cutover, and its bare `/`
// should show what the real domains will once they're pointed here, rather
// than sending every visitor through the ordinary session redirect. Every
// other path on stage is completely unaffected — `/admin`, `/portal`,
// `/login` on stage still work exactly as they always have.
const MARKETING_HOSTS = new Set(["www.firsthing.earth", "firsthing.earth", "stage.firsthing.earth"]);

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

  if (pathname === "/" && MARKETING_HOSTS.has(hostOf(req))) {
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
