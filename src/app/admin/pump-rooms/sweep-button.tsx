"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sweepPumpRoomEmailsNow } from "./actions";

export function SweepButton() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await sweepPumpRoomEmailsNow();
            if ("error" in r && r.error) setNotice(r.error);
            else setNotice(`Checked ${r.checked ?? 0} new email${r.checked === 1 ? "" : "s"} — ${r.applied ?? 0} applied, ${r.needsAssignment ?? 0} need a pump room.`);
            router.refresh();
          })
        }
      >
        {pending ? "Checking…" : "Check for new emails"}
      </button>
      {notice && (
        <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
          {notice}
        </p>
      )}
    </div>
  );
}
