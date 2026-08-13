"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useRoleGuard } from "@/lib/use-role-guard";
import type { Role } from "@/lib/roles";
import Sidebar from "./Sidebar";
import Header, { type ScreenAction } from "./Header";

type ShellContextValue = {
  setScreenAction: (action: ScreenAction) => void;
  setFreshness: (date: Date | null) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

/** Lets a page override the header's primary action (e.g. with a dynamically resolved href). */
export function useScreenAction(action: ScreenAction) {
  const ctx = useContext(ShellContext);
  const label = action?.label;
  const href = action?.href;

  useEffect(() => {
    ctx?.setScreenAction(action ?? null);
    return () => ctx?.setScreenAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, href]);
}

/** Opts the header's freshness pill into showing a real "Ns ago" tick. Renders nothing if never called. */
export function useFreshness(lastUpdatedAt?: Date | null) {
  const ctx = useContext(ShellContext);
  const time = lastUpdatedAt?.getTime();

  useEffect(() => {
    ctx?.setFreshness(lastUpdatedAt ?? null);
    return () => ctx?.setFreshness(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);
}

export default function AppShell({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: ReactNode;
}) {
  const guard = useRoleGuard(allowedRoles);
  const pathname = usePathname();
  const [screenAction, setScreenAction] = useState<ScreenAction>(null);
  const [freshness, setFreshness] = useState<Date | null>(null);
  const ctxValue = useMemo(() => ({ setScreenAction, setFreshness }), []);

  if (guard.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg font-mono text-sm text-m1">
        Checking permissions…
      </div>
    );
  }

  return (
    <ShellContext.Provider value={ctxValue}>
      <div className="flex min-h-screen flex-col bg-bg md:flex-row">
        <Sidebar profile={guard.profile} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header screenAction={screenAction} freshness={freshness} />
          <main key={pathname} className="flex-1 overflow-y-auto p-5 md:p-8" style={{ animation: "fthFade 300ms ease" }}>
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
