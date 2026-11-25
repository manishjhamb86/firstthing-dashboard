"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomepageSocietyStat } from "../actions";

type Mode = "auto" | "pinned" | "held";

/** Auto / Pin (with its order) / Hold, for one society. */
export function SocietyStatControl({ societyId, mode, priority }: { societyId: string; mode: Mode; priority: number }) {
  const router = useRouter();
  const [m, setM] = useState<Mode>(mode);
  const [p, setP] = useState(String(priority));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = m !== mode || (m === "pinned" && Number(p) !== priority);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`hm-${societyId}`}>
        Homepage setting
      </label>
      <select id={`hm-${societyId}`} className="field field-auto" value={m} onChange={(e) => setM(e.target.value as Mode)} disabled={pending}>
        <option value="auto">Auto</option>
        <option value="pinned">Pin to the top</option>
        <option value="held">Hold off the homepage</option>
      </select>
      {m === "pinned" && (
        <>
          <label className="sr-only" htmlFor={`hp-${societyId}`}>
            Pin order
          </label>
          <input id={`hp-${societyId}`} className="field field-auto num w-[70px]" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} title="Order among pinned (lower first)" />
        </>
      )}
      {dirty && (
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const r = await setHomepageSocietyStat(societyId, m, Number(p) || 0);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
      )}
      {error && <span className="w-full text-xs text-[var(--bad-fg)]">{error}</span>}
    </span>
  );
}
