"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-config";
import { useNavBadgeCounts } from "@/lib/use-nav-badge-counts";
import { signOut } from "next-auth/react";
import type { GuardedProfile } from "@/lib/use-role-guard";

const ROLE_SCOPE_LABEL: Record<GuardedProfile["role"], string> = {
  admin: "Platform admin",
  customer: "Society account",
  inspection: "Inspection team",
  socmgr: "Society manager",
};

export default function Sidebar({ profile }: { profile: GuardedProfile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS[profile.role];
  const badgeCounts = useNavBadgeCounts(profile.role);
  const initials = (profile.email ?? "??").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await signOut({ redirect: false });
    window.location.href = "/login";
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-[var(--sh)] px-4 py-3 text-[var(--shink)] md:hidden">
        <span className="text-sm font-bold">FirsThing</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] font-semibold"
          style={{ color: "var(--shm1)" }}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[246px] flex-col transition-transform duration-200 md:relative md:z-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--sh)", color: "var(--shink)" }}
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
          <div
            className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[15px] font-extrabold"
            style={{ background: "linear-gradient(150deg, var(--lime), var(--ac))", color: "var(--limeink)" }}
          >
            F
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-bold tracking-[-0.2px]">FirsThing</div>
            <div className="font-mono text-[9px] tracking-[0.08em]" style={{ color: "var(--shm1)" }}>
              ENERGITRACK OPS
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3.5 py-3">
          <div
            className="px-1.5 pb-2 pt-2 font-mono text-[9px] font-semibold tracking-[0.11em]"
            style={{ color: "var(--shm2)" }}
          >
            NAVIGATION
          </div>
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const badge = item.badgeKey ? badgeCounts[item.badgeKey] : undefined;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded-[9px] px-2.5 py-2 text-xs font-semibold"
                style={{
                  background: active ? "var(--sh2)" : "transparent",
                  color: active ? "var(--lime)" : "var(--shm1)",
                }}
              >
                <span>{item.label}</span>
                {badge !== undefined && (
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 font-mono text-[9px] font-semibold"
                    style={{ background: "rgba(255,255,255,.1)", color: "var(--shm1)" }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2.5 border-t border-white/10 p-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-[10px] font-bold"
              style={{ background: "var(--sh2)", color: "var(--lime)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11.5px] font-semibold" style={{ color: "var(--shink)" }}>
                {profile.email ?? "Signed in"}
              </div>
              <div className="font-mono text-[9.5px]" style={{ color: "var(--shm2)" }}>
                {ROLE_SCOPE_LABEL[profile.role]}
                {profile.society_name ? ` · ${profile.society_name}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-[8px] border border-white/10 px-2.5 py-1.5 text-left text-[11px] font-semibold"
            style={{ color: "var(--shm1)" }}
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
