import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ROLE_HOME, isRole } from "@/lib/roles";

// Route-prefix -> roles allowed. `null` = any authenticated role (matches
// inspection-reports' current, pre-existing lack of a role gate — see
// src/app/inspection-reports/page.tsx, which only checks for a logged-in
// user with a society_id, no role check. Not widening or narrowing that
// here.
const ROUTE_ROLES: Record<string, string[] | null> = {
  "/admin": ["admin"],
  "/socmgr": ["socmgr"],
  "/inspection": ["inspection"],
  "/inspection-reports": null,
  "/invoices": ["customer"],
  "/profile": ["customer"],
  "/reports": ["customer"],
  "/water-tanks": ["customer"],
  "/": ["customer"],
};

function matchRoute(pathname: string): string[] | null | undefined {
  for (const prefix of Object.keys(ROUTE_ROLES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return ROUTE_ROLES[prefix];
    }
  }
  return undefined; // not a protected prefix — left alone
}

// NOTE: this is an OPTIMISTIC check only (Next.js docs: "it should not be
// your only line of defense... The majority of security checks should be
// performed as close as possible to your data source"). auth() here reads
// the JWT session cookie only — no DB round trip. Every Route Handler and
// Server Action added in later phases MUST independently call auth() and
// check role/ownership; a matcher change here can silently stop covering a
// path.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

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
    return NextResponse.redirect(
      new URL(isRole(role) ? ROLE_HOME[role] : "/login", req.url)
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml)$).*)",
  ],
};
