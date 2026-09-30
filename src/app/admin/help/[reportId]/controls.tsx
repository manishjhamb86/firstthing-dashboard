"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { HELP_CATEGORIES, HELP_CATEGORY_LABEL } from "@/lib/help-report";
import { replyToHelp, setHelpCategory, setHelpStatus } from "../actions";

export function HelpDeskControls({ reportId, status, category }: { reportId: string; status: string; category: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="mt-5 space-y-4">
      <div>
        <label htmlFor="help-staff-reply" className="block font-semibold mb-1">
          Reply to them
        </label>
        <textarea id="help-staff-reply" className="field" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
        <button type="button" className="btn-primary mt-2" disabled={pending || !reply.trim()} onClick={() => run(() => replyToHelp(reportId, reply), () => setReply(""))}>
          Send reply
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px]">
          <span className="block mb-1 text-[var(--text-muted)]">What it is</span>
          <select
            className="field field-auto"
            value={category ?? ""}
            disabled={pending}
            onChange={(e) => e.target.value && run(() => setHelpCategory(reportId, e.target.value))}
          >
            {!category && <option value="">Not sorted yet</option>}
            {HELP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {HELP_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {status !== "in_progress" && status !== "resolved" && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => setHelpStatus(reportId, "in_progress"))}>
            Take it up
          </button>
        )}
        {status !== "resolved" && !resolving && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setResolving(true)}>
            Resolve…
          </button>
        )}
        {status === "resolved" && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => setHelpStatus(reportId, "open"))}>
            Reopen
          </button>
        )}
      </div>

      {resolving && (
        <div>
          <label htmlFor="help-resolve" className="block font-semibold mb-1">
            How was it resolved? (they read this)
          </label>
          <textarea id="help-resolve" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => setHelpStatus(reportId, "resolved", note), () => setResolving(false))}>
              Mark resolved
            </button>
            <button type="button" className="btn-ghost" onClick={() => setResolving(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
