"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, StatusChip } from "@/components/ui";
import { createPosition, setPositionActive } from "@/app/admin/societies/[id]/members/actions";

export function PositionsClient({ positions }: { positions: { id: string; name: string; active: boolean; holders: number }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  return (
    <div className="space-y-4">
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {positions.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
            <span style={p.active ? undefined : { color: "var(--text-subtle)" }}>
              {p.name} {!p.active && <StatusChip tone="neu">Hidden</StatusChip>}
              <span className="ml-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                {p.holders} current {p.holders === 1 ? "member" : "members"}
              </span>
            </span>
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setPositionActive(p.id, !p.active))}>
              {p.active ? "Hide from the list" : "Show in the list"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="field field-auto" aria-label="New position" placeholder="New position, e.g. Joint secretary" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn-secondary btn-sm" disabled={pending || !name.trim()} onClick={() => run(() => createPosition(name), () => setName(""))}>
          Add position
        </button>
      </div>
      <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
        A hidden position stays on the members who hold it; it is only no longer offered for new members.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
