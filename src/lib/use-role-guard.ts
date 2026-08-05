"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ROLE_HOME, isRole, type Role } from "./roles";

export type GuardedProfile = {
  id: string;
  role: Role;
  society_id: number | null;
  society_name: string | null;
  email: string | null;
};

type GuardState =
  | { status: "loading"; profile: null }
  | { status: "authorized"; profile: GuardedProfile };

/**
 * Replaces the old checkAccess() effect duplicated across admin/inspection
 * layouts. Session now comes from NextAuth instead of Supabase; on an
 * authenticated-but-wrong-role session, redirects to that role's own home
 * rather than a hardcoded path.
 */
export function useRoleGuard(allowedRoles: Role[]): GuardState {
  const router = useRouter();
  const { data: session, status } = useSession();
  const allowedKey = allowedRoles.join(",");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user) {
      router.replace("/login");
      return;
    }

    const role = session.user.role;
    if (!isRole(role)) {
      router.replace("/login");
      return;
    }

    if (!allowedKey.split(",").includes(role)) {
      router.replace(ROLE_HOME[role]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, allowedKey]);

  const role = session?.user?.role;
  const authorized =
    status === "authenticated" &&
    !!session?.user &&
    isRole(role) &&
    allowedKey.split(",").includes(role);

  if (!authorized) {
    return { status: "loading", profile: null };
  }

  return {
    status: "authorized",
    profile: {
      id: session.user.id,
      role: session.user.role,
      society_id: session.user.societyId,
      society_name: session.user.societyName,
      email: session.user.email ?? null,
    },
  };
}
