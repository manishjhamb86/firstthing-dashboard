import { NextRequest, NextResponse } from "next/server";
import { STAGE_ACCESS_COOKIE, stageAccessGranted } from "@/lib/stage-access";

// The one public entry point into a gated stage (2026-10-22, user-asked):
// "create a link that will create the required access cookie... accessible
// without any protection as the entry point... valid for 24 hours only...
// the user will have to access that link again". Before this, the gate's
// cookie could only be set by hand (devtools/a cookie-editor extension) with
// whatever lifetime the person setting it happened to choose — this route
// hands it out instead, with a lifetime the APP controls rather than the
// visitor's own browser tooling.
//
// It adds no new secret and no new rule for what unlocks staging:
// stageAccessGranted() is the exact same check proxy.ts's gate already runs
// against the cookie, so the token in this link IS the cookie value — there
// is nothing else for a visitor to discover or guess beyond what the manual
// method already required them to be handed out of band.
//
// Reachable with NO prior cookie, by construction — proxy.ts excludes this
// one path from its own 403 before the gate ever runs (see its own comment),
// the same shape /api/session-ended uses to escape the loop IT exists to
// break: a route whose whole job is to grant/clear a cookie cannot itself
// require the thing it grants.
const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!stageAccessGranted(token)) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(STAGE_ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  });
  return res;
}
