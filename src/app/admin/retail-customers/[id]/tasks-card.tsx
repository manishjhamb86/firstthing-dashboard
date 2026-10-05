"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, EmptyState, ErrorText, Field, StatusChip, type ChipTone } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { TASK_STATE_LABEL, type TaskState } from "@/lib/tasks";
import { createTask } from "../../tasks/actions";

const STATE_TONE: Record<TaskState, ChipTone> = { overdue: "bad", due_today: "warn", upcoming: "info", done: "ok", cancelled: "neu" };

export type CustomerTaskRow = { id: string; title: string; due: string; assignee: string; state: TaskState };

/** What still needs doing for this customer, and a quick way to add one more
 *  (2026-09-30) — the same ScheduledEvent rows the Tasks tab shows, so
 *  closing one there closes it here too. */
export function CustomerTasksCard({
  customerId,
  tasks,
  me,
  people,
  today,
}: {
  customerId: string;
  tasks: CustomerTaskRow[];
  me: string;
  people: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", assigneeId: me, due: today });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createTask({
        title: f.title,
        description: "",
        assigneeId: f.assigneeId,
        due: f.due,
        time: "",
        priority: "normal",
        societyId: "",
        requiresProof: false,
        retailCustomerId: customerId,
      });
      if (r.error) return setError(r.error);
      setF({ title: "", assigneeId: me, due: today });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="mb-0">Tasks</CardTitle>
        <button type="button" className="btn-outline btn-sm" onClick={() => { setError(null); setOpen((v) => !v); }}>
          {open ? "Cancel" : "New task"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <Field label="What needs doing" htmlFor="ct-title">
            <input id="ct-title" className="field" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Assigned to" htmlFor="ct-assignee">
              <select id="ct-assignee" className="field" value={f.assigneeId} onChange={(e) => setF((x) => ({ ...x, assigneeId: e.target.value }))}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Due" htmlFor="ct-due">
              <input id="ct-due" type="date" className="field" value={f.due} onChange={(e) => setF((x) => ({ ...x, due: e.target.value }))} />
            </Field>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <button type="button" className="btn-primary btn-sm" disabled={pending || !f.title.trim()} onClick={save}>
            {pending ? "Adding…" : "Add task"}
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing outstanding">A task added here also appears on the Tasks tab and the assignee&apos;s dashboard.</EmptyState>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13.5px]">
              <span>
                <Link href={`/admin/tasks?open=${t.id}`} className="font-medium underline">{t.title}</Link>{" "}
                <span style={{ color: "var(--text-subtle)" }}>— {t.assignee} · due {formatDate(t.due)}</span>
              </span>
              <StatusChip tone={STATE_TONE[t.state]}>{TASK_STATE_LABEL[t.state]}</StatusChip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
