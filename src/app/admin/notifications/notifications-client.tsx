"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { EmptyState, StatusChip } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { AcknowledgeButton } from "./acknowledge-button";
import { NOTIFICATION_CATEGORY_LABEL, type Notification, type NotificationCategory } from "@/lib/notification-types";

type Item = Notification & {
  label: string;
  tone: "bad" | "warn";
  category: NotificationCategory;
  actionLabel: string;
  acknowledgeable: boolean;
};

const CATEGORY_ORDER: NotificationCategory[] = ["meter", "billing", "inspection", "request", "help", "followup"];

function matches(n: Item, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return [n.message, n.subject, n.societyName, n.circuitLabel, n.ownerLabel, n.label]
    .filter((s): s is string => Boolean(s))
    .some((s) => s.toLowerCase().includes(q));
}

/**
 * The 25-items-in-one-list problem (user-caught, 2026-10-07): a flat
 * chronological dump exhausts the reader before they reach the one thing
 * they actually came to look for. Three moves instead of a longer list:
 * category chips to jump straight to "just billing" or "just meters" (with
 * search narrowing any of them further), unacknowledged items surfaced
 * first and sorted worst-first (tone, then repeat offenders, then age) so
 * the top of the page is always the most urgent thing, and an
 * already-acknowledged item — someone is already chasing it — demoted into
 * a closed-by-default disclosure rather than taking up the same visual
 * weight as something nobody has looked at yet.
 */
export function NotificationsClient({ items }: { items: Item[] }) {
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const n of items) c[n.category] = (c[n.category] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => items.filter((n) => (category === "all" || n.category === category) && matches(n, query)),
    [items, category, query],
  );

  const needsAttention = useMemo(
    () =>
      filtered
        .filter((n) => n.acknowledgedAt === null)
        .sort((a, b) => {
          if (a.tone !== b.tone) return a.tone === "bad" ? -1 : 1;
          if (a.raiseCount !== b.raiseCount) return b.raiseCount - a.raiseCount;
          return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
        }),
    [filtered],
  );
  const acknowledged = useMemo(
    () =>
      filtered
        .filter((n) => n.acknowledgedAt !== null)
        .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()),
    [filtered],
  );

  const presentCategories = CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0);

  return (
    <div className="card p-6">
      <h2 className="text-[16px] font-semibold">Open</h2>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        These conditions are still true. Acknowledging takes one off the badge without closing it
        — only the condition itself clearing does that.
      </p>

      {items.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
              All · {counts.all}
            </CategoryChip>
            {presentCategories.map((c) => (
              <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {NOTIFICATION_CATEGORY_LABEL[c]} · {counts[c]}
              </CategoryChip>
            ))}
          </div>
          {items.length > 4 && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search society, meter, message…"
              label="Search notifications"
              className="w-full sm:w-72"
            />
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing open">
            Every meter is reporting, every day is inside what its circuit can draw, and nothing
            else is waiting on anyone.
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No match">
            Nothing {category === "all" ? "open" : `in ${NOTIFICATION_CATEGORY_LABEL[category]}`} matches &ldquo;{query}&rdquo;.
          </EmptyState>
        </div>
      ) : (
        <>
          {needsAttention.length === 0 ? (
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">
              Everything matching this filter has already been acknowledged — see below.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {needsAttention.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </ul>
          )}

          {acknowledged.length > 0 && (
            <details className="mt-4" open={needsAttention.length === 0}>
              <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
                Acknowledged — still open, already being chased ({acknowledged.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {acknowledged.map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      style={
        active
          ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
          : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
      }
    >
      {children}
    </button>
  );
}

function NotificationRow({ n }: { n: Item }) {
  return (
    <li
      className="rounded-[var(--r-sm)] p-3"
      style={{
        background: n.tone === "bad" ? "var(--bad-bg)" : "var(--warn-bg)",
        border: `1px solid ${n.tone === "bad" ? "var(--bad-line)" : "var(--warn-line)"}`,
      }}
    >
      {/* A phone-width card stacks the info and the actions as two full-width
          blocks rather than sharing one wrapped row with them — the
          row-based layout let "Acknowledge" render on top of the status
          chip on a narrow viewport (user-caught on stage, 2026-09-30). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <StatusChip tone={n.tone}>{n.label}</StatusChip>
            <span className="num text-xs text-[var(--text-subtle)]">
              since {n.openedAt.slice(0, 16).replace("T", " ")}
            </span>
            {n.raiseCount > 1 && (
              <span className="text-xs font-semibold" style={{ color: "var(--bad-fg)" }}>
                raised {n.raiseCount}× — acknowledged before and still not resolved
              </span>
            )}
            {n.acknowledgedAt && (
              <span className="text-xs text-[var(--text-subtle)]">
                · acknowledged {n.acknowledgedAt.slice(0, 16).replace("T", " ")}
              </span>
            )}
          </div>
          <p className="text-[13px]">{n.message}</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            {[n.societyName, n.circuitLabel].filter(Boolean).join(" · ") || "not assigned"}
            {n.ownerLabel ? ` · ${n.ownerLabel} to chase` : " · nobody named to chase it"}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:shrink-0">
          {n.acknowledgeable && !n.acknowledgedAt && <AcknowledgeButton alertId={n.id} />}
          <Link href={n.href} className="text-[13px] font-semibold underline">
            {n.actionLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}
