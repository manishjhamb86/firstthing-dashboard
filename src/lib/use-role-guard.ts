"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
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
 * Replaces the checkAccess() effect duplicated across admin/inspection
 * layouts. On an authenticated-but-wrong-role session, redirects to that
 * role's own home rather than a hardcoded path.
 */
export function useRoleGuard(allowedRoles: Role[]): GuardState {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ status: "loading", profile: null });
  const allowedKey = allowedRoles.join(",");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, society_id, society_name")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (!profile || !isRole(profile.role)) {
        router.replace("/login");
        return;
      }

      if (!allowedKey.split(",").includes(profile.role)) {
        router.replace(ROLE_HOME[profile.role]);
        return;
      }

      setState({
        status: "authorized",
        profile: { ...profile, email: session.user.email ?? null },
      });
    }

    check();
    return () => {
      cancelled = true;
    };
    // allowedKey is a stable stringified form of allowedRoles, used instead
    // of the array itself so a new literal each render doesn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey]);

  return state;
}
