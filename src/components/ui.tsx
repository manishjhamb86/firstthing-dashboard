import type { ReactNode } from "react";

// Shared presentational primitives for the DIR-02 Console system
// (docs/product/05a-theme-system.md). No hooks — usable from Server and
// Client Components alike; interaction stays in the caller.

export type ChipTone = "ok" | "warn" | "bad" | "info" | "neu";

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`chip chip-${tone}`}>
      <span className="chip-dot" aria-hidden />
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className ?? ""}`}>{children}</div>;
}

// Section heading inside a card — Modernize-style sentence-case semibold,
// replacing the Console small-caps treatment.
export function CardTitle({ children }: { children: ReactNode }) {
  return <p className="text-[15px] font-semibold mb-4">{children}</p>;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  chip,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  chip?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {breadcrumb && <div className="mb-1 text-sm text-[var(--text-subtle)]">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.018em]">{title}</h1>
            {chip}
          </div>
          {subtitle && <p className="mt-1 text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

// INV-06 — every list surface defines an empty state.
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-[var(--r-md)] p-8 text-center">
      <p className="font-semibold mb-1">{title}</p>
      {children && <div className="text-sm text-[var(--text-muted)]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Labeled form field wrapper — real <label>s, never placeholder-only
// (this repo's own documented rule from the archived app's invoice work:
// placeholders disappear the moment a field has a value).
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="lbl">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm" style={{ color: "var(--bad-fg)" }}>
      {children}
    </p>
  );
}

// KPI tile — the admin-template signature: a tinted icon bubble beside the
// figure. Icon optional so existing call sites keep working; the figure
// stays in the data face (tabular, comparable down a column).
const KPI_TONE: Record<string, { bg: string; fg: string }> = {
  accent: { bg: "var(--accent-subtle)", fg: "var(--accent)" },
  ok: { bg: "var(--ok-bg)", fg: "var(--ok-fg)" },
  warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  bad: { bg: "var(--bad-bg)", fg: "var(--bad-fg)" },
  info: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
};

export function KpiTile({
  label,
  value,
  detail,
  icon,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof KPI_TONE;
}) {
  const t = KPI_TONE[tone] ?? KPI_TONE.accent;
  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        {icon && (
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: t.bg, color: t.fg }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="num text-[24px] font-semibold leading-tight">{value}</p>
          <p className="text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
          {detail && <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
