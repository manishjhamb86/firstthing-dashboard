"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { adminSetTicketStatus } from "./actions";

/** The same open → in progress → resolved controls the portal has, admin-gated. */
export function AdminTicketControls({ ticketId, status }: { ticketId: string; status: string }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function apply(next: string, noteText?: string) {
    startTransition(async () => {
      const r = await adminSetTicketStatus(ticketId, next, noteText);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setResolving(false);
      setNote("");
      setError(undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "open" && (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => apply("in_progress")}>
          Take it up
        </button>
      )}
      {status !== "resolved" && (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => setResolving(true)}>
          Resolve…
        </button>
      )}
      {status === "resolved" && (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => apply("open")}>
          Reopen
        </button>
      )}
      {error && !resolving && <ErrorText>{error}</ErrorText>}

      <Modal
        open={resolving}
        onClose={() => setResolving(false)}
        title="Resolve this request"
        description="The society reads this note as the answer to its request."
        footer={
          <button type="button" className="btn-primary" disabled={pending} onClick={() => apply("resolved", note)}>
            {pending ? "Resolving…" : "Resolve"}
          </button>
        }
      >
        <Field label="How it was resolved" htmlFor={`adm-resolve-${ticketId}`}>
          <textarea
            id={`adm-resolve-${ticketId}`}
            className="field"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </div>
  );
}
