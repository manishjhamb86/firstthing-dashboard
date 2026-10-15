"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { adminSetTicketStatus, assignTicket, updateTicketDetails } from "./actions";

type Assignee = { id: string; name: string | null; email: string };

/** The same open → in progress → resolved controls the portal has, admin-gated,
 *  plus who's handling it and a correction path for the ticket's own wording. */
export function AdminTicketControls({
  ticketId,
  status,
  assignedToId,
  assignees,
  subject,
  detail,
}: {
  ticketId: string;
  status: string;
  assignedToId: string | null;
  assignees: Assignee[];
  subject: string;
  detail: string;
}) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [editSubject, setEditSubject] = useState(subject);
  const [editDetail, setEditDetail] = useState(detail);
  const [error, setError] = useState<string | undefined>();
  const [assignError, setAssignError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [assignPending, startAssignTransition] = useTransition();

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

  function assign(assigneeId: string) {
    setAssignError(undefined);
    startAssignTransition(async () => {
      const r = await assignTicket(ticketId, assigneeId || null);
      if ("error" in r) {
        setAssignError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function saveEdit() {
    startTransition(async () => {
      const r = await updateTicketDetails(ticketId, editSubject, editDetail);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setEditing(false);
      setError(undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label="Assign to"
        className="field field-auto text-[12.5px]"
        value={assignedToId ?? ""}
        disabled={assignPending}
        onChange={(e) => assign(e.target.value)}
      >
        <option value="">Unassigned</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name ?? a.email}
          </option>
        ))}
      </select>
      {status === "open" && (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => apply("in_progress")}>
          Take it up
        </button>
      )}
      {status === "in_progress" && (
        <button type="button" className="btn-sm btn-ghost" disabled={pending} onClick={() => apply("open")}>
          Undo
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
      <button
        type="button"
        className="btn-sm btn-ghost"
        disabled={pending}
        onClick={() => {
          setEditSubject(subject);
          setEditDetail(detail);
          setEditing(true);
        }}
      >
        Edit…
      </button>
      {assignError && <ErrorText>{assignError}</ErrorText>}
      {error && !resolving && !editing && <ErrorText>{error}</ErrorText>}

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

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit this request"
        description="Correcting the wording — the society still sees this as its own request."
        footer={
          <button type="button" className="btn-primary" disabled={pending} onClick={saveEdit}>
            {pending ? "Saving…" : "Save"}
          </button>
        }
      >
        <Field label="Subject" htmlFor={`adm-edit-subject-${ticketId}`}>
          <input
            id={`adm-edit-subject-${ticketId}`}
            className="field"
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
          />
        </Field>
        <Field label="Detail" htmlFor={`adm-edit-detail-${ticketId}`}>
          <textarea
            id={`adm-edit-detail-${ticketId}`}
            className="field"
            rows={4}
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </div>
  );
}
