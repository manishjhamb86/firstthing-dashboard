import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";
import { logger } from "./logger";
import { isPortalRole } from "./roles";

// Closes the gap PROJECT_CONTEXT.md's MS-02 section recorded and deliberately
// left open: "a JWT session's role doesn't refresh when the underlying
// Profile.portalAuthority changes", so an office-bearer who has just
// transferred the designation away still carries office_bearer in their token
// and could transfer it back before the JWT expires. NFR-13 puts the portal
// session lifetime at 90 days, so that window is not small — and for a
// *binding* act specifically, exercising an authority you no longer hold is
// the whole thing GATE-04 exists to prevent.
//
// Same decision, same shape, and the same reasoning as resolveAdmin() in
// ./admin-permissions.ts: the token says who signed in, the row says what
// they may do now. Also catches the deleted/deactivated cases, which the
// token likewise cannot.
export const resolvePortalViewer = cache(async () => {
  const session = await auth();
  if (!session?.user || !isPortalRole(session.user.role)) return null;

  const profile = await db.profile.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, societyId: true, portalAuthority: true, isActive: true },
  });

  if (!profile) {
    logger.warn("auth.stale_session", { userId: session.user.id, reason: "profile_deleted" });
    return null;
  }
  if (!profile.isActive || !profile.portalAuthority) {
    logger.warn("auth.stale_session", {
      userId: profile.id,
      reason: profile.isActive ? "portal_authority_revoked" : "profile_deactivated",
    });
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    societyId: profile.societyId,
    // The authority in force right now, not the one minted at login.
    role: profile.portalAuthority,
  };
});
