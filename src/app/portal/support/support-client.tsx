"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Truck, Wrench } from "lucide-react";
import { Card, ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { createTicket, setTicketStatus } from "./ticket-actions";

/**
 * The raise-a-request flow: three cards, one dialog. The dialog is the
 * shared Modal (the repo's one dialog component — the assign-panel lesson),
 * with the type preselected by whichever card opened it. Controlled inputs
 * throughout, per the standing React-19 form rule: an uncontrolled required
 * field silently eats the retry after a failed submit.
 */
const KINDS = [
  {
    type: "complaint",
    icon: MessageSquare,
    title: "Raise a complaint",
    sub: "A light out, a level reading wrong, anything not behaving.",
  },
  {
    type: "device_replacement",
    icon: Wrench,
    title: "Faulty device replacement",
    sub: "A FirsThing fitting or sensor that needs swapping out.",
  },
  {
    type: "pickup",
    icon: Truck,
    title: "Pickup request",
    sub: "Removed or spare material waiting to be collected.",
  },
] as const;

export function RaiseTicketCards({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [openType, setOpenType] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const active = KINDS.find((k) => k.type === openType);

  function submit() {
    const fd = new FormData();
    fd.set("type", openType ?? "");
    fd.set("subject", subject);
    fd.set("detail", detail);
    startTransition(async () => {
      const r = await createTicket(fd);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      // Close on success, stay open on a refusal — the flicker lesson.
      setOpenType(null);
      setSubject("");
      setDetail("");
      setError(undefined);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {KINDS.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.type} className="flex flex-col p-5">
              <span
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--r-sm)]"
                style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
              >
                <Icon size={19} strokeWidth={1.75} aria-hidden />
              </span>
              <p className="text-sm font-bold">{k.title}</p>
              <p className="mb-3 mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {k.sub}
              </p>
              {canManage ? (
                <button type="button" className="btn-secondary mt-auto self-start" onClick={() => setOpenType(k.type)}>
                  Raise
                </button>
              ) : (
                <p className="mt-auto text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                  Raising requests needs the tickets access — ask your office-bearer.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Modal
        open={openType !== null}
        onClose={() => {
          setOpenType(null);
          setError(undefined);
        }}
        title={active?.title ?? "Raise a request"}
        description={active?.sub}
        footer={
          <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
            {pending ? "Raising…" : "Raise request"}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Subject" htmlFor="ticket-subject" hint="One line the team can triage from.">
            <input
              id="ticket-subject"
              className="field"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Two lights out near B-wing lift lobby"
            />
          </Field>
          <Field label="What happened" htmlFor="ticket-detail">
            <textarea
              id="ticket-detail"
              className="field"
              rows={4}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Where it is, since when, anything the team should bring."
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

export function TicketStatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function apply(next: string, noteText?: string) {
    startTransition(async () => {
      const r = await setTicketStatus(ticketId, next, noteText);
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
          Mark in progress
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
        description="The note stays on the record — say how it ended."
        footer={
          <button type="button" className="btn-primary" disabled={pending} onClick={() => apply("resolved", note)}>
            {pending ? "Resolving…" : "Resolve"}
          </button>
        }
      >
        <Field label="How it was resolved" htmlFor={`resolve-${ticketId}`}>
          <textarea
            id={`resolve-${ticketId}`}
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
