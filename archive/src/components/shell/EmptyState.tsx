import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card-2 px-6 py-10 text-center">
      <div className="text-sm font-semibold text-ink">{title}</div>
      {description && <div className="max-w-sm text-xs leading-relaxed text-m2">{description}</div>}
      {action}
    </div>
  );
}
