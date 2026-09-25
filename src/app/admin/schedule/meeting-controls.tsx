"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import type { MeetingInput } from "@/lib/calendar-event";
import { cancelMeeting, createMeeting, retryCalendarSync, updateMeeting } from "./actions";

export type Person = { id: string; name: string; email: string };
export type MeetingEdit = { id: string; input: MeetingInput };

const DURATIONS = [15, 30, 45, 60, 90, 120];

function blank(today: string): MeetingInput {
  return { title: "", agenda: "", date: today, time: "11:00", minutes: 30, inviteeIds: [], otherEmails: "", societyId: "", addMeet: true };
}

/**
 * The meeting form (2026-09-25): who, when, how long, and a Google Meet link
 * by default. Used for a new meeting and for changing one.
 */
function MeetingForm({
  open,
  onClose,
  initial,
  editingId,
  people,
  societies,
  me,
}: {
  open: boolean;
  onClose: () => void;
  initial: MeetingInput;
  editingId: string | null;
  people: Person[];
  societies: { id: string; name: string }[];
  me: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<MeetingInput>(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setF(initial);
  }
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const others = people.filter((p) => p.id !== me);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return others.filter((p) => !f.inviteeIds.includes(p.id) && (!n || `${p.name} ${p.email}`.toLowerCase().includes(n))).slice(0, 8);
  }, [others, f.inviteeIds, q]);
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setF((x) => ({ ...x, [k]: v }));

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = editingId ? await updateMeeting(editingId, f) : await createMeeting(f);
      if (r.error) return setError(r.error);
      router.refresh();
      if (r.warning) setNotice(r.warning);
      else onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null);
        setNotice(null);
        onClose();
      }}
      size="wide"
      title={editingId ? "Change meeting" : "New meeting"}
      description="Goes on everyone's Google Calendar with an invitation, and appears here on their schedule."
      footer={
        notice ? (
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || !f.title.trim()} onClick={save}>
              {pending ? "Sending invitations…" : editingId ? "Save and update invitations" : "Create and send invitations"}
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <Field label="What is it about" htmlFor="mt-title">
          <input id="mt-title" className="field" value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="mt-date">
            <input id="mt-date" type="date" className="field" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Starts" htmlFor="mt-time">
            <input id="mt-time" type="time" className="field" value={f.time} onChange={(e) => set("time", e.target.value)} />
          </Field>
          <Field label="Runs for" htmlFor="mt-minutes">
            <select id="mt-minutes" className="field" value={f.minutes} onChange={(e) => set("minutes", Number(e.target.value))}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Invite colleagues" htmlFor="mt-people">
          {f.inviteeIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {f.inviteeIds.map((id) => {
                const p = people.find((x) => x.id === id);
                return (
                  <button key={id} type="button" className="chip" onClick={() => set("inviteeIds", f.inviteeIds.filter((x) => x !== id))} title="Remove">
                    {p?.name ?? id} ×
                  </button>
                );
              })}
            </div>
          )}
          <input id="mt-people" className="field" placeholder="Type a name" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim() && (
            <ul className="mt-1 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>Nobody by that name.</li>
              ) : (
                matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-[13.5px] hover:bg-[var(--accent-subtle)]"
                      onClick={() => {
                        set("inviteeIds", [...f.inviteeIds, p.id]);
                        setQ("");
                      }}
                    >
                      {p.name} <span style={{ color: "var(--text-subtle)" }}>· {p.email}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </Field>
        <Field label="Anyone else, by email (optional)" htmlFor="mt-emails" hint="A society's committee member, a supplier — separate addresses with commas.">
          <input id="mt-emails" className="field" value={f.otherEmails} onChange={(e) => set("otherEmails", e.target.value)} />
        </Field>
        <Field label="Agenda (optional)" htmlFor="mt-agenda">
          <textarea id="mt-agenda" className="field" rows={3} value={f.agenda} onChange={(e) => set("agenda", e.target.value)} />
        </Field>
        <Field label="About a society (optional)" htmlFor="mt-society">
          <select id="mt-society" className="field" value={f.societyId} onChange={(e) => set("societyId", e.target.value)}>
            <option value="">Not about a society</option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={f.addMeet} onChange={(e) => set("addMeet", e.target.checked)} />
          Add a Google Meet video link
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        {notice && (
          <p className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function NewMeetingButton(props: { people: Person[]; societies: { id: string; name: string }[]; me: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(() => blank(props.today));
  return (
    <>
      <button
        type="button"
        className="btn-primary btn-sm"
        onClick={() => {
          setInitial(blank(props.today));
          setOpen(true);
        }}
      >
        New meeting
      </button>
      <MeetingForm open={open} onClose={() => setOpen(false)} initial={initial} editingId={null} {...props} />
    </>
  );
}

/** A meeting's own controls on the schedule: join it, and — for its host — change or cancel it. */
export function MeetingActions({
  edit,
  canManage,
  people,
  societies,
  me,
}: {
  edit: MeetingEdit;
  canManage: boolean;
  people: Person[];
  societies: { id: string; name: string }[];
  me: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canManage) return null;
  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Change
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setCancelling(true)}>
        Cancel meeting
      </button>
      <MeetingForm open={open} onClose={() => setOpen(false)} initial={edit.input} editingId={edit.id} people={people} societies={societies} me={me} />
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this meeting"
        description="It is removed from everyone's Google Calendar, and Google tells them it is off."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setCancelling(false)}>
              Back
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={pending || !reason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await cancelMeeting(edit.id, reason);
                  if (r.error) setError(r.error);
                  else {
                    setCancelling(false);
                    router.refresh();
                  }
                })
              }
            >
              Cancel meeting
            </button>
          </>
        }
      >
        <Field label="Why" htmlFor={`mc-${edit.id}`}>
          <input id={`mc-${edit.id}`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </>
  );
}

/** "Try again" on an entry Google refused. */
export function RetrySyncButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await retryCalendarSync(id);
            setError(r.error ?? null);
            router.refresh();
          })
        }
      >
        {pending ? "Trying…" : "Try again"}
      </button>
      {error && <span className="text-[12px]" style={{ color: "var(--bad-fg)" }}>{error}</span>}
    </span>
  );
}
