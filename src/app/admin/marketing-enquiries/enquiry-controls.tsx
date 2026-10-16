"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { markEnquiryFollowedUp, reopenEnquiry } from "./actions";

export function EnquiryControls({ enquiryId, followedUp }: { enquiryId: string; followedUp: boolean }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function followUp() {
    startTransition(async () => {
      const r = await markEnquiryFollowedUp(enquiryId, note);
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

  function reopen() {
    startTransition(async () => {
      const r = await reopenEnquiry(enquiryId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {followedUp ? (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={reopen}>
          Reopen
        </button>
      ) : (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => setResolving(true)}>
          Mark followed up…
        </button>
      )}
      {error && !resolving && <ErrorText>{error}</ErrorText>}

      <Modal
        open={resolving}
        onClose={() => setResolving(false)}
        title="Mark this enquiry followed up"
        description="A short note on what came of it — a closed enquiry with nothing said is indistinguishable from one closed to tidy the list."
        footer={
          <button type="button" className="btn-primary" disabled={pending} onClick={followUp}>
            {pending ? "Saving…" : "Mark followed up"}
          </button>
        }
      >
        <Field label="What came of it" htmlFor={`enq-note-${enquiryId}`}>
          <textarea
            id={`enq-note-${enquiryId}`}
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
