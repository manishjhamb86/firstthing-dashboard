"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isThemeId, type ThemeId } from "@/lib/theme";

// docs/product/05a-theme-system.md §3.2b: stored server-side, tied to the
// account. Writes straight to whichever table minted the session (AdminUser
// or Profile) — the same account-table split every other action in this
// codebase already respects (INV-01).
export async function setThemePreference(theme: ThemeId) {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in." };
  if (!isThemeId(theme)) return { error: "Invalid theme." };

  if (session.user.role === "admin") {
    await db.adminUser.update({ where: { id: session.user.id }, data: { themePreference: theme } });
  } else {
    await db.profile.update({ where: { id: session.user.id }, data: { themePreference: theme } });
  }

  logger.info("theme.changed", { userId: session.user.id, role: session.user.role, theme });
  revalidatePath("/", "layout");
  return {};
}
