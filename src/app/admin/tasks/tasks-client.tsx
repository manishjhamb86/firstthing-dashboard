"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip, type ChipTone } from "@/components/ui";
import { Modal } from "@/components/modal";
import { cancelTask, completeTask, createTask, reopenTask, updateTask } from "./actions";

export type TaskRow = {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high";
  status: "scheduled" | "done" | "cancelled";
  state: "overdue" | "due_today" | "upcoming" | "done" | "cancelled";
  stateLabel: string;
  due: string;
  dueIso: string;
  timeIso: string;
  dueMs: number;
  assigneeId: string;
  assignee: string;
  createdById: string;
  createdBy: string;
  societyId: string;
  society: string | null;
  href: string | null;
  closedNote: string | null;
  mayAct: boolean;
  meetLink: string | null;
  onGoogle: boolean;
};

const STATE_TONE: Record<TaskRow["state"], ChipTone> = { overdue: "bad", due_today: "warn", upcoming: "info", done: "ok", cancelled: "neu" };
type Show = "open" | "done" | "all";
type Scope = "mine" | "set" | "all";

type Form = { title: string; description: string; assigneeId: string; due: string; time: string; priority: "low" | "normal" | "high"; societyId: string };

export function TasksClient({
  rows,
  me,
  isOps,
  people,
  societies,
  today,
  highlight,
}: {
  rows: TaskRow[];
  me: string;
  isOps: boolean;
  people: { id: string; name: string }[];
  societies: { id: string; name: string }[];
  today: string;
  highlight: string | null;
}) {
  const router = useRouter();
  const [show, setShow] = useState<Show>("open");
  const [scope, setScope] = useState<Scope>("mine");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; f: Form } | null>(null);
  const [closing, setClosing] = useState<{ row: TaskRow; mode: "done" | "cancel"; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (highlight) document.getElementById(`task-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight]);

  const inScope = useMemo(
    () => rows.filter((r) => (scope === "mine" ? r.assigneeId === me : scope === "set" ? r.createdById === me : true)),
    [rows, scope, me],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inScope
      .filter((r) => (show === "open" ? r.status === "scheduled" : show === "done" ? r.status !== "scheduled" : true))
      .filter((r) => !needle || `${r.title} ${r.description ?? ""} ${r.society ?? ""} ${r.assignee}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.status === "scheduled") === (b.status === "scheduled") ? (a.status === "scheduled" ? a.dueMs - b.dueMs : b.dueMs - a.dueMs) : a.status === "scheduled" ? -1 : 1);
  }, [inScope, show, q]);
  const openCount = inScope.filter((r) => r.status === "scheduled").length;
  const doneCount = inScope.length - openCount;

  const blank: Form = { title: "", description: "", assigneeId: me, due: today, time: "", priority: "normal", societyId: "" };

  function run(fn: () => Promise<{ error?: string }>, after: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after();
        router.refresh();
      }
    });
  }

  const chip = (active: boolean) =>
    active ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" } : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" style={chip(show === "open")} onClick={() => setShow("open")}>
          Open {openCount}
        </button>
        <button type="button" className="chip" style={chip(show === "done")} onClick={() => setShow("done")}>
          Completed {doneCount}
        </button>
        <button type="button" className="chip" style={chip(show === "all")} onClick={() => setShow("all")}>
          All {inScope.length}
        </button>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
        <button type="button" className="chip" style={chip(scope === "mine")} onClick={() => setScope("mine")}>
          Assigned to me
        </button>
        <button type="button" className="chip" style={chip(scope === "set")} onClick={() => setScope("set")}>
          Set by me
        </button>
        {isOps && (
          <button type="button" className="chip" style={chip(scope === "all")} onClick={() => setScope("all")}>
            Everyone&apos;s
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <input className="field field-auto" placeholder="Search tasks" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ id: null, f: blank })}>
            New task
          </button>
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-6 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
            {show === "open" ? "Nothing open here." : show === "done" ? "Nothing completed yet." : "No tasks yet."}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {shown.map((r) => (
              <li
                key={r.id}
                id={`task-${r.id}`}
                className="flex flex-wrap items-start gap-3 px-4 py-3"
                style={r.id === highlight ? { background: "var(--accent-subtle)" } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold" style={r.status !== "scheduled" ? { color: "var(--text-subtle)", textDecoration: r.status === "cancelled" ? "line-through" : undefined } : undefined}>
                    {r.href ? <Link href={r.href}>{r.title}</Link> : r.title}
                  </p>
                  {r.description && <p className="whitespace-pre-line text-[13px]" style={{ color: "var(--text-muted)" }}>{r.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    <StatusChip tone={STATE_TONE[r.state]}>{r.stateLabel}</StatusChip>
                    {r.priority === "high" && <StatusChip tone="bad">High priority</StatusChip>}
                    {r.kind !== "task" && <StatusChip tone="neu">{r.kindLabel}</StatusChip>}
                    <span>Due {r.due}</span>
                    <span>· {r.assigneeId === me ? "You" : r.assignee}</span>
                    {r.createdById !== r.assigneeId && <span>· set by {r.createdById === me ? "you" : r.createdBy}</span>}
                    {r.society && <span>· {r.society}</span>}
                    {r.onGoogle && r.status === "scheduled" && <span>· on Google Calendar</span>}
                    {r.meetLink && r.status === "scheduled" && (
                      <a href={r.meetLink} target="_blank" rel="noopener noreferrer" className="font-semibold">
                        · Join Google Meet ↗
                      </a>
                    )}
                  </p>
                  {r.closedNote && <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>{r.closedNote}</p>}
                </div>
                {r.mayAct && (
                  <div className="flex shrink-0 gap-2">
                    {r.status === "scheduled" ? (
                      <>
                        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => setClosing({ row: r, mode: "done", note: "" })}>
                          Mark done
                        </button>
                        {r.kind === "task" && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() =>
                              setEditing({
                                id: r.id,
                                f: { title: r.title, description: r.description ?? "", assigneeId: r.assigneeId, due: r.dueIso, time: r.timeIso, priority: r.priority, societyId: r.societyId },
                              })
                            }
                          >
                            Edit
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => reopenTask(r.id), () => {})}>
                        Reopen
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit task" : "New task"}
        footer={
          <>
            {editing?.id && (
              <button
                type="button"
                className="btn-ghost mr-auto"
                onClick={() => {
                  const row = rows.find((x) => x.id === editing.id);
                  setEditing(null);
                  if (row) setClosing({ row, mode: "cancel", note: "" });
                }}
              >
                Cancel this task
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !editing?.f.title.trim()}
              onClick={() => editing && run(() => (editing.id ? updateTask(editing.id, editing.f) : createTask(editing.f)), () => setEditing(null))}
            >
              {pending ? "Saving…" : editing?.id ? "Save" : "Create task"}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Field label="What is to be done" htmlFor="tk-title">
              <input id="tk-title" className="field" value={editing.f.title} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, title: e.target.value } })} />
            </Field>
            <Field label="Details (optional)" htmlFor="tk-desc">
              <textarea id="tk-desc" className="field" rows={3} value={editing.f.description} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, description: e.target.value } })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assigned to" htmlFor="tk-assignee">
                <select id="tk-assignee" className="field" value={editing.f.assigneeId} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, assigneeId: e.target.value } })}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === me ? `${p.name} (you)` : p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority" htmlFor="tk-priority">
                <select id="tk-priority" className="field" value={editing.f.priority} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, priority: e.target.value as Form["priority"] } })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Due" htmlFor="tk-due">
                <input id="tk-due" type="date" className="field" value={editing.f.due} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, due: e.target.value } })} />
              </Field>
              <Field label="Time (optional)" htmlFor="tk-time">
                <input id="tk-time" type="time" className="field" value={editing.f.time} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, time: e.target.value } })} />
              </Field>
            </div>
            <Field label="About a society (optional)" htmlFor="tk-society">
              <select id="tk-society" className="field" value={editing.f.societyId} onChange={(e) => setEditing((x) => x && { ...x, f: { ...x.f, societyId: e.target.value } })}>
                <option value="">Not about a society</option>
                {societies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>

      <Modal
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing?.mode === "cancel" ? "Cancel this task" : "Mark done"}
        description={closing?.row.title}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setClosing(null)}>
              Back
            </button>
            <button
              type="button"
              className={closing?.mode === "cancel" ? "btn-danger" : "btn-primary"}
              disabled={pending || (closing?.mode === "cancel" && !closing.note.trim())}
              onClick={() => closing && run(() => (closing.mode === "done" ? completeTask(closing.row.id, closing.note) : cancelTask(closing.row.id, closing.note)), () => setClosing(null))}
            >
              {closing?.mode === "cancel" ? "Cancel task" : "Mark done"}
            </button>
          </>
        }
      >
        {closing && (
          <div className="space-y-3">
            {closing.mode === "done" && closing.row.kind !== "task" && (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                This comes from a deal step. Marking it done here only closes it on the list — record the work itself on the deal.
              </p>
            )}
            <Field label={closing.mode === "cancel" ? "Why" : "Note (optional)"} htmlFor="tk-note">
              <input id="tk-note" className="field" value={closing.note} onChange={(e) => setClosing((x) => x && { ...x, note: e.target.value })} />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        )}
      </Modal>
    </div>
  );
}
