/**
 * Help from the field app (docs/engineering/21-field-help.md) — the rules,
 * pure, so both ends and the tests agree without a request or a browser.
 *
 * A report arrives as one outbox item (`help.report`). Its attachments go up
 * first, like an installation day's photos, to the PRIVATE `Help/{itemId}/`
 * prefix: a screenshot of a field screen can show a society's figures, so
 * these are served by signed links only, never the public `Documents/` tree.
 */

export const MAX_HELP_PHOTOS = 4;
/** Screenshot + voice note + photos. */
export const MAX_HELP_ATTACHMENTS = MAX_HELP_PHOTOS + 2;
export const MAX_DESCRIPTION = 4000;

export type HelpAttachmentRole = "screenshot" | "voice" | "photo";
export type HelpCategory = "question" | "bug" | "blocker" | "suggestion";
export const HELP_CATEGORIES: HelpCategory[] = ["question", "bug", "blocker", "suggestion"];

export const HELP_CATEGORY_LABEL: Record<HelpCategory, string> = {
  question: "Question",
  bug: "Bug",
  blocker: "Blocked on site",
  suggestion: "Suggestion",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extFor(contentType: string): string | null {
  const t = contentType.toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/aac": "aac",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };
  return map[t] ?? null;
}

/** The one key an attachment of this report may have (deterministic, so a re-send overwrites). */
export function helpAttachmentKey(itemId: string, index: number, contentType: string): string | { error: string } {
  if (!UUID_RE.test(itemId)) return { error: "The report has no valid id." };
  if (!Number.isInteger(index) || index < 0 || index >= MAX_HELP_ATTACHMENTS) return { error: `A report carries at most ${MAX_HELP_ATTACHMENTS} attachments.` };
  const ext = extFor(contentType);
  if (!ext) return { error: "Only a photo, a screenshot or a voice note can be attached." };
  return `Help/${itemId.toLowerCase()}/${index}.${ext}`;
}

export type HelpReportPayload = {
  description: string;
  page: string;
  pageTitle: string | null;
  taskEventId: string | null;
  /** What each uploaded key is, in order. */
  attachments: HelpAttachmentRole[];
  photoKeys: string[];
  clientInfo: Record<string, unknown> | null;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A `help.report` payload, checked. The keys must be this item's own. */
export function parseHelpReport(itemId: string, payload: unknown): HelpReportPayload | { error: string } {
  if (!payload || typeof payload !== "object") return { error: "Not a help report." };
  const o = payload as Record<string, unknown>;
  const description = s(o.description).slice(0, MAX_DESCRIPTION);
  const page = s(o.page);
  if (!page.startsWith("/field")) return { error: "The report does not say which screen it came from." };
  const roles = Array.isArray(o.attachments) ? o.attachments : [];
  const keys = Array.isArray(o.photoKeys) ? o.photoKeys : [];
  if (roles.length !== keys.length) return { error: "The report's attachments did not all arrive." };
  if (roles.length > MAX_HELP_ATTACHMENTS) return { error: `A report carries at most ${MAX_HELP_ATTACHMENTS} attachments.` };
  const attachments: HelpAttachmentRole[] = [];
  for (const r of roles) {
    if (r !== "screenshot" && r !== "voice" && r !== "photo") return { error: "Unknown attachment." };
    attachments.push(r);
  }
  if (attachments.filter((a) => a === "screenshot").length > 1 || attachments.filter((a) => a === "voice").length > 1) {
    return { error: "A report carries one screenshot and one voice note at most." };
  }
  if (attachments.filter((a) => a === "photo").length > MAX_HELP_PHOTOS) return { error: `At most ${MAX_HELP_PHOTOS} photos.` };
  const prefix = `Help/${itemId.toLowerCase()}/`;
  const photoKeys: string[] = [];
  for (const k of keys) {
    if (typeof k !== "string" || !k.startsWith(prefix)) return { error: "An attachment does not belong to this report." };
    photoKeys.push(k);
  }
  if (!description && !attachments.includes("voice")) return { error: "Say what is wrong — type it, or record it." };
  const taskEventId = s(o.taskEventId) || null;
  const clientInfo = o.clientInfo && typeof o.clientInfo === "object" ? (o.clientInfo as Record<string, unknown>) : null;
  return { description, page, pageTitle: s(o.pageTitle).slice(0, 200) || null, taskEventId, attachments, photoKeys, clientInfo };
}

/** Split the uploaded keys by what they are. */
export function attachmentsByRole(p: Pick<HelpReportPayload, "attachments" | "photoKeys">) {
  let screenshotKey: string | null = null;
  let voiceKey: string | null = null;
  const photos: string[] = [];
  p.attachments.forEach((role, i) => {
    const key = p.photoKeys[i];
    if (role === "screenshot") screenshotKey = key;
    else if (role === "voice") voiceKey = key;
    else photos.push(key);
  });
  return { screenshotKey, voiceKey, photoKeys: photos };
}

// ---------------------------------------------------------------------------
// The AI's reading, and where a report goes.
// ---------------------------------------------------------------------------

export type HelpTriage = {
  category: HelpCategory;
  /** A short title for the desk (under 80 characters). */
  title: string;
  /** What the person should read in the chat. */
  reply: string;
  /** The voice note, in words (empty when there was none). */
  transcript: string;
  /** For a question: whether the guide actually answered it. */
  answered: boolean;
};

/** Gemini's JSON, checked — a malformed answer is refused, never half-trusted. */
export function parseTriage(raw: unknown): HelpTriage | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "The AI returned no reading." };
  const o = raw as Record<string, unknown>;
  const category = s(o.category) as HelpCategory;
  if (!HELP_CATEGORIES.includes(category)) return { error: `The AI returned an unknown category (${String(o.category)}).` };
  const reply = s(o.reply);
  if (!reply) return { error: "The AI returned no reply." };
  return {
    category,
    title: (s(o.title) || HELP_CATEGORY_LABEL[category]).slice(0, 80),
    reply: reply.slice(0, 3000),
    transcript: s(o.transcript).slice(0, MAX_DESCRIPTION),
    answered: category === "question" && o.answered === true,
  };
}

export type HelpStatusValue = "new" | "open" | "answered" | "in_progress" | "resolved";

/**
 * Who hears about a report, and what state it lands in — decided here, from
 * the category, never by the model (the user's routing choices):
 *   question   — answered in the chat; a question the guide could not answer
 *                goes to operations as well.
 *   bug        — everyone with "Receives bug reports"; operations when nobody does.
 *   blocker    — whoever assigned the task, and operations.
 *   suggestion — operations.
 * The reporter is never notified about their own report.
 */
export function routeHelp(input: {
  category: HelpCategory | null;
  answered: boolean;
  reporterId: string;
  taskAssignerId: string | null;
  bugReceiverIds: string[];
  operationsIds: string[];
}): { status: HelpStatusValue; notify: string[] } {
  const without = (ids: (string | null)[]) => [...new Set(ids.filter((x): x is string => !!x && x !== input.reporterId))];
  switch (input.category) {
    case "question":
      return input.answered ? { status: "answered", notify: [] } : { status: "open", notify: without(input.operationsIds) };
    case "bug":
      return { status: "open", notify: without(input.bugReceiverIds.length ? input.bugReceiverIds : input.operationsIds) };
    case "blocker":
      return { status: "open", notify: without([input.taskAssignerId, ...input.operationsIds]) };
    case "suggestion":
      return { status: "open", notify: without(input.operationsIds) };
    default:
      // The AI could not read it: a person must.
      return { status: "open", notify: without(input.operationsIds) };
  }
}

/** A reply from the reporter on an answered question means the answer did not do it. */
export function statusAfterReporterReply(status: HelpStatusValue): HelpStatusValue {
  return status === "answered" || status === "resolved" ? "open" : status;
}
