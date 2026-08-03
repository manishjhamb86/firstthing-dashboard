"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getScreenMeta } from "@/lib/screen-meta";
import ThemeSwitcher from "./ThemeSwitcher";

export type ScreenAction = { label: string; href?: string; onClick?: () => void } | null;

export default function Header({
  screenAction,
  freshness,
}: {
  screenAction: ScreenAction;
  freshness: Date | null;
}) {
  const pathname = usePathname();
  const meta = getScreenMeta(pathname);
  const action =
    screenAction ??
    (meta.primaryAction ? { label: meta.primaryAction.label, href: meta.primaryAction.href } : null);

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-border bg-[var(--hdr)] px-5 py-4 backdrop-blur-md md:px-8">
      <div className="min-w-[230px] flex-1">
        <div className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-m2">
          {meta.breadcrumb}
        </div>
        <h1 className="text-[21px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">{meta.title}</h1>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-2">
        <ThemeSwitcher />

        {freshness && <FreshnessPill since={freshness} />}

        <input
          type="search"
          placeholder="Search societies, meters…"
          className="hidden w-[210px] rounded-[9px] border border-border bg-card px-3 py-2 text-xs text-ink placeholder:text-m2 focus:outline-none lg:block"
        />

        {action &&
          (action.href ? (
            <Link href={action.href} className="rounded-[9px] bg-ac px-4 py-2 text-xs font-bold text-onac">
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="rounded-[9px] bg-ac px-4 py-2 text-xs font-bold text-onac"
            >
              {action.label}
            </button>
          ))}
      </div>
    </header>
  );
}

function FreshnessPill({ since }: { since: Date }) {
  const [label, setLabel] = useState(() => formatAgo(since));

  useEffect(() => {
    setLabel(formatAgo(since));
    const id = setInterval(() => setLabel(formatAgo(since)), 15000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full bg-pos"
        style={{ animation: "fthPulse 2.4s ease-in-out infinite" }}
      />
      <span className="font-mono text-[10.5px] text-m1">FEED LIVE · {label}</span>
    </div>
  );
}

function formatAgo(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
