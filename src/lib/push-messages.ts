/**
 * What a push notification to the field app says, and where it opens
 * (19-field-app.md §18). Pure, so the wording is tested once and every sender
 * uses it. A notification is a pointer, not the record: it names the work and
 * opens the page where it is done — never a figure or a customer detail that
 * would sit on a lock screen.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** A same-origin path the notification opens. */
  url: string;
  /** One notification per tag: a second one for the same thing replaces the first. */
  tag: string;
};

export type AssignmentKind = "survey" | "replacement" | "installation" | "task";

const ASSIGNMENT_TITLE: Record<AssignmentKind, string> = {
  survey: "New survey for you",
  replacement: "Light replacement assigned to you",
  installation: "Installation day assigned to you",
  task: "New task for you",
};

export function assignmentMessage(input: {
  kind: AssignmentKind;
  /** The society, or the task's own title. */
  what: string;
  /** When it is due, already formatted — omitted when not booked yet. */
  when?: string | null;
  /** Who assigned it. */
  by?: string | null;
  url: string;
  /** The record's id, so a re-assignment replaces its own notification. */
  ref: string;
}): PushMessage {
  const parts = [input.what];
  if (input.when) parts.push(input.when);
  if (input.by) parts.push(`from ${input.by}`);
  return { title: ASSIGNMENT_TITLE[input.kind], body: parts.join(" · "), url: input.url, tag: `assign:${input.kind}:${input.ref}` };
}

export type MeterAlertPushKind = "offline" | "capacity" | string;

export function meterAlertMessage(input: { kind: MeterAlertPushKind; meterName: string; place?: string | null; meterId: string }): PushMessage {
  const title = input.kind === "offline" ? "Meter stopped reporting" : input.kind === "capacity" ? "Meter reading beyond what the circuit can draw" : "Meter alert";
  const body = [input.meterName, input.place].filter(Boolean).join(" · ");
  return { title, body, url: `/admin/meters/${input.meterId}`, tag: `meter:${input.kind}:${input.meterId}` };
}

/** Whether a sender should notify: never for a person assigning work to themselves. */
export function shouldNotifyAssignee(assigneeId: string | null | undefined, actorId: string | null | undefined): assigneeId is string {
  return typeof assigneeId === "string" && assigneeId.length > 0 && assigneeId !== actorId;
}

/** The three kinds the demo monitoring sweep raises (demo-monitoring.ts). */
export type DemoAlertKind = "demo_pre_variance" | "demo_post_variance" | "demo_readings_missing";

const DEMO_ALERT_TITLE: Record<DemoAlertKind, string> = {
  demo_pre_variance: "Demo reading outside the expected range",
  demo_post_variance: "Demo savings outside the expected range",
  demo_readings_missing: "Upload yesterday's demo reading",
};

/** System-raised, not an assignment — there is no "by" and no self-skip actor. */
export function demoAlertMessage(input: { kind: DemoAlertKind; what: string; detail?: string | null; url: string; ref: string }): PushMessage {
  const parts = [input.what];
  if (input.detail) parts.push(input.detail);
  return { title: DEMO_ALERT_TITLE[input.kind], body: parts.join(" · "), url: input.url, tag: `demo:${input.kind}:${input.ref}` };
}
