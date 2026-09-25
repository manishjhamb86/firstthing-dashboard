// Tasks (2026-09-25): anything someone has to do, assigned to a person.
// Stored as ScheduledEvent rows (kind "task") so the deal's own assignments —
// the demo meeting, the survey visit, the replacement day — sit in the same
// list. Pure rules; the actions are thin shells.

export type TaskStatus = "scheduled" | "done" | "cancelled";
export type TaskState = "overdue" | "due_today" | "upcoming" | "done" | "cancelled";

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Where a task stands. Due dates are stored as entered (the app's wall-clock
 * convention), so "today" compares calendar days, not instants — a task due
 * at 17:00 today is due today, not overdue at 09:00.
 */
export function taskState(t: { status: TaskStatus; startAt: Date }, today: Date): TaskState {
  if (t.status === "done") return "done";
  if (t.status === "cancelled") return "cancelled";
  const d = dayUtc(t.startAt);
  const n = dayUtc(today);
  return d < n ? "overdue" : d === n ? "due_today" : "upcoming";
}

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
  done: "Done",
  cancelled: "Cancelled",
};

export type TaskSummary = { open: number; overdue: number; dueToday: number; dueThisWeek: number };

export function taskSummary(tasks: Array<{ status: TaskStatus; startAt: Date }>, today: Date): TaskSummary {
  const weekEnd = dayUtc(today) + 7 * 86_400_000;
  const s: TaskSummary = { open: 0, overdue: 0, dueToday: 0, dueThisWeek: 0 };
  for (const t of tasks) {
    const st = taskState(t, today);
    if (st === "done" || st === "cancelled") continue;
    s.open += 1;
    if (st === "overdue") s.overdue += 1;
    if (st === "due_today") s.dueToday += 1;
    if (dayUtc(t.startAt) < weekEnd) s.dueThisWeek += 1;
  }
  return s;
}

/** Who may close or reopen a task: whoever it is assigned to, whoever set it, or operations. */
export function mayActOnTask(actorId: string, t: { assigneeId: string; createdById: string }, isOps: boolean): boolean {
  return isOps || actorId === t.assigneeId || actorId === t.createdById;
}

/** Why a task cannot be saved as entered, or null. */
export function refuseTask(input: { title: string; assigneeId: string; due: string; time: string }): string | null {
  if (!input.title.trim()) return "Say what the task is.";
  if (!input.assigneeId) return "Choose who it is assigned to.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due) || Number.isNaN(new Date(`${input.due}T00:00:00Z`).getTime())) return "Choose the due date.";
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return "That time is not valid.";
  return null;
}

/** The stored due instant: the typed date (and time), wall-clock, like every other appointment. */
export function dueInstant(due: string, time: string): { startAt: Date; allDay: boolean } {
  return time ? { startAt: new Date(`${due}T${time}:00Z`), allDay: false } : { startAt: new Date(`${due}T00:00:00Z`), allDay: true };
}
