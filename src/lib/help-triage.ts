// Reading a field Help report with Gemini, and routing it
// (docs/engineering/21-field-help.md). A plain module, not "use server": the
// sync route runs it right after a report arrives (next/server `after`), and
// the worker's sweep retries the ones Gemini could not read.
//
// The AI answers and classifies. It never changes data, and it does not
// decide who is told — routeHelp (help-report.ts) does, from the category.

import { GoogleGenAI } from "@google/genai";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { withModelFallback, quotaKind } from "@/lib/gemini-models";
import { FIELD_APP_GUIDE } from "@/lib/help-guide";
import { HELP_CATEGORY_LABEL, parseTriage, routeHelp, type HelpTriage } from "@/lib/help-report";
import { sendPush } from "@/lib/push";

export const MAX_AI_ATTEMPTS = 5;

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["question", "bug", "blocker", "suggestion"] },
    title: { type: "string" },
    reply: { type: "string" },
    transcript: { type: "string" },
    answered: { type: "boolean" },
  },
  required: ["category", "title", "reply", "transcript", "answered"],
};

const PROMPT = `You read a help report sent from FirsThing Field, the phone app our in-house field team uses.
FirsThing retrofits LED lighting in housing societies and bills a share of the saving.

Decide what the report is, and write a reply to the person:
- "question": they want to know how to do something, or cannot find something. Answer from the GUIDE below, in plain steps. Set "answered" true only if the guide really answers it; if it does not, say you have passed it to operations and set "answered" false.
- "bug": the app is not working as it should (a button that does nothing, a wrong figure, an error, a screen that will not load or save). Reply with a workaround from the guide if there is one, and say the development team has been told.
- "blocker": something on SITE is stopping their work (water leakage, a locked room, no power, society refusing access, unsafe conditions, missing material). Reply that the person who assigned the task and operations have been told, and one sentence on what they can safely do meanwhile if obvious.
- "suggestion": they expected something the app does not have, or want a change. Thank them briefly and say operations has it.
When it is both a question and a bug, choose "bug" if the app misbehaved.

Rules:
- The reply goes to a field worker on a phone: short (under 90 words), friendly, no jargon, in the same language they wrote or spoke in (English, Hindi or Hinglish).
- Never promise a date or a fix. Never say you changed anything — you cannot change data.
- "title": under 70 characters, for the office's list, e.g. "Save inspection does nothing" or "Water leakage in basement, B-tower".
- "transcript": if a voice note is attached, what it says in words, as spoken; otherwise "".
- The screenshot (if any) is the app screen they were on when they tapped Help. Photos are what they took on site.

GUIDE
`;

async function objectBase64(key: string): Promise<{ data: string; mime: string } | null> {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      obj.ContentType && obj.ContentType !== "application/octet-stream"
        ? obj.ContentType.split(";")[0]
        : ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", m4a: "audio/m4a", aac: "audio/aac", webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" } as Record<string, string>)[ext] ?? "application/octet-stream";
    return { data: Buffer.from(bytes).toString("base64"), mime: mime === "audio/mp4" ? "audio/m4a" : mime };
  } catch (err) {
    logger.warn("help.attachment_unreadable", { key, error: String(err) });
    return null;
  }
}

type ReportForTriage = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

function loadReport(id: string) {
  return db.helpReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, name: true, email: true, team: true } },
      task: { select: { id: true, title: true, kind: true, createdById: true, startAt: true, society: { select: { name: true } } } },
    },
  });
}

async function askGemini(r: ReportForTriage): Promise<HelpTriage> {
  const context = [
    `Reporter: ${r.reporter.name ?? r.reporter.email} (team: ${r.reporter.team}).`,
    `Screen: ${r.page}${r.pageTitle ? ` — "${r.pageTitle}"` : ""}.`,
    r.task ? `About the task: ${r.task.title}${r.task.society ? ` at ${r.task.society.name}` : ""}.` : "No task named.",
    r.clientInfo ? `What the phone added: ${JSON.stringify(r.clientInfo).slice(0, 1500)}` : "",
    `What they wrote or dictated: ${r.description || "(nothing — see the voice note)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const input: Array<Record<string, unknown>> = [{ type: "text", text: `${PROMPT}${FIELD_APP_GUIDE}\n\nREPORT\n${context}` }];
  const keys = [r.screenshotKey, ...r.photoKeys.slice(0, 3)].filter((k): k is string => !!k);
  for (const k of keys) {
    const a = await objectBase64(k);
    if (a && a.mime.startsWith("image/")) input.push({ type: "image", data: a.data, mime_type: a.mime });
  }
  if (r.voiceKey) {
    const a = await objectBase64(r.voiceKey);
    if (a) input.push({ type: "audio", data: a.data, mime_type: a.mime });
  }

  return withModelFallback(async (model) => {
    const interaction = await gemini().interactions.create({
      model,
      // The SDK's content union is wide; each entry above is one of its members.
      input: input as never,
      response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
    });
    if (!interaction.output_text) throw new Error("Gemini returned no output");
    const parsed = parseTriage(JSON.parse(interaction.output_text));
    if ("error" in parsed) throw new Error(parsed.error);
    return parsed;
  });
}

async function routingIds(r: ReportForTriage) {
  const [ops, bug] = await Promise.all([
    db.adminUser.findMany({ where: { team: "operations", isActive: true }, select: { id: true } }),
    db.adminUser.findMany({ where: { receivesBugReports: true, isActive: true }, select: { id: true } }),
  ]);
  return {
    operationsIds: ops.map((a) => a.id),
    bugReceiverIds: bug.map((a) => a.id),
    taskAssignerId: r.task?.createdById ?? null,
  };
}

async function namesOf(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.adminUser.findMany({ where: { id: { in: ids } }, select: { name: true, email: true } });
  return rows.map((a) => a.name ?? a.email);
}

async function notifyDesk(reportId: string, ids: string[], title: string, from: string) {
  if (!ids.length) return;
  await sendPush(ids, { title: `Help: ${title}`, body: `From ${from}`, url: `/admin/help/${reportId}`, tag: `help:${reportId}` });
}

/**
 * Read one report with Gemini and route it. Never throws. A report already
 * read is left alone; a failure is recorded and, the first time, the report
 * goes to operations unread so it is never lost behind a quota.
 */
export async function runHelpTriage(reportId: string): Promise<"done" | "failed" | "skipped"> {
  const r = await loadReport(reportId);
  if (!r || r.aiState === "done") return "skipped";
  const from = r.reporter.name ?? r.reporter.email;
  const ids = await routingIds(r);

  let triage: HelpTriage;
  try {
    triage = await askGemini(r);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const firstFailure = r.status === "new";
    const route = routeHelp({ category: null, answered: false, reporterId: r.reporterId, ...ids });
    await db.helpReport.update({
      where: { id: r.id },
      data: {
        aiState: "failed",
        aiAttempts: { increment: 1 },
        aiError: quotaKind(raw) === "quota" ? "The AI's daily limit is used up; it will try again later." : raw.slice(0, 300),
        ...(firstFailure ? { status: route.status, routedToIds: route.notify } : {}),
      },
    });
    logger.warn("help.triage_failed", { reportId: r.id, attempts: r.aiAttempts + 1, quota: quotaKind(raw) === "quota", error: raw.slice(0, 300) });
    if (firstFailure) await notifyDesk(r.id, route.notify, "a report the AI could not read", from);
    return "failed";
  }

  // Staff may have set the category meanwhile; theirs stands.
  const category = r.categorySource === "staff" && r.category ? r.category : triage.category;
  const route = routeHelp({ category, answered: triage.answered, reporterId: r.reporterId, ...ids });
  const sentTo = await namesOf(route.notify);
  const note = route.notify.length && category !== "question" ? `\n\nSent to: ${sentTo.join(", ")}.` : "";
  const alreadyRouted = r.status !== "new";

  await db.$transaction([
    db.helpReport.update({
      where: { id: r.id },
      data: {
        category,
        categorySource: r.categorySource === "staff" ? "staff" : "ai",
        title: triage.title,
        transcript: triage.transcript || null,
        aiState: "done",
        aiReadAt: new Date(),
        aiError: null,
        aiAttempts: { increment: 1 },
        // An unread report already went to operations; the AI's reading
        // settles its category without moving a status a person may have set.
        ...(alreadyRouted ? {} : { status: route.status }),
        routedToIds: [...new Set([...r.routedToIds, ...route.notify])],
      },
    }),
    db.helpMessage.create({ data: { reportId: r.id, author: "ai", body: `${triage.reply}${note}` } }),
  ]);
  logger.info("help.triaged", { reportId: r.id, category, answered: triage.answered, notified: route.notify.length });

  const fresh = route.notify.filter((id) => !r.routedToIds.includes(id));
  await notifyDesk(r.id, fresh, `${HELP_CATEGORY_LABEL[category]} — ${triage.title}`, from);
  await sendPush([r.reporterId], {
    title: category === "question" ? "Answer to your question" : "Your report reached the office",
    body: triage.title,
    url: `/field/more/help/${r.id}`,
    tag: `help-reply:${r.id}`,
  });
  return "done";
}

/** The worker's pass: every report the AI has not read yet, a few at a time. */
export async function runHelpTriageSweep(limit = 5): Promise<{ done: number; failed: number }> {
  const due = await db.helpReport.findMany({
    where: { aiState: { in: ["pending", "failed"] }, aiAttempts: { lt: MAX_AI_ATTEMPTS }, createdAt: { lt: new Date(Date.now() - 60_000) } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let done = 0;
  let failed = 0;
  for (const r of due) {
    const out = await runHelpTriage(r.id);
    if (out === "done") done++;
    else if (out === "failed") failed++;
  }
  return { done, failed };
}
