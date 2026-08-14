import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";
import { DEFAULT_THEME, type ThemeId } from "./theme";

// Resolved fresh from the DB every request, deliberately not from the JWT
// session: a JWT field would go stale the moment the switcher writes a new
// preference, the same staleness class already documented for
// portalAuthority in PROJECT_CONTEXT.md's MS-02 section. One indexed lookup
// per request is a cheap trade for "the account's real current choice,
// always" (05a-theme-system.md §3.2b — the preference belongs to the
// account, not a token minted at login time). Wrapped in React's cache() so
// the layout and any nav component that also needs it (AdminNav, the portal
// header) share that one lookup per request instead of each re-querying.
export const resolveTheme = cache(async (): Promise<ThemeId> => {
  const session = await auth();
  if (!session?.user) return DEFAULT_THEME;

  const preference =
    session.user.role === "admin"
      ? (await db.adminUser.findUnique({ where: { id: session.user.id }, select: { themePreference: true } }))
          ?.themePreference
      : (await db.profile.findUnique({ where: { id: session.user.id }, select: { themePreference: true } }))
          ?.themePreference;

  return preference ?? DEFAULT_THEME;
});
