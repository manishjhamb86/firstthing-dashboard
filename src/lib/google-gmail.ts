// Gmail client (EMS pump-room ingestion). Server-only: a Workspace service
// account with domain-wide delegation, impersonating ONE fixed mailbox.
//
// Written against Google's own docs rather than pulling in `googleapis`,
// reusing the exact JWT/token mechanics google-calendar.ts already proved
// against the real Workspace domain — only the scope and the target API
// change:
// - token: a JWT signed RS256 with the service account's key, `sub` = the
//   mailbox acted for, exchanged at https://oauth2.googleapis.com/token with
//   grant_type urn:ietf:params:oauth:grant-type:jwt-bearer (max 1 hour).
// - mail: GET /gmail/v1/users/me/messages (list), /messages/{id} (read),
//   /messages/{id}/attachments/{attachmentId} (fetch the attachment's
//   bytes). "me" resolves to whichever mailbox the token impersonates.
//
// Simpler than Calendar in one respect: Calendar impersonates whichever
// user organizes a given event — many different subjects. This only ever
// impersonates the ONE dedicated mailbox the EMS vendor's email is
// forwarded to (never a real person's inbox), so every call here takes no
// `organizer` parameter at all.
//
// Only gmail.readonly is requested: this client can read messages in the
// one mailbox it acts for, and nothing else — it cannot send, delete, or
// modify anything.
//
// Gotcha worth keeping explicit: Gmail does NOT inline an attachment's
// bytes in messages.get — any part of real size carries only
// `body.attachmentId`, never `body.data`, which is why getAttachment is a
// separate call.
//
// GMAIL_FAKE=1 swaps in a stand-in that answers without calling Google
// (verification without an account); it logs every call so it can never be
// mistaken for the real thing.

import { createSign } from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseServiceAccount } from "@/lib/google-calendar";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailConfig = {
  clientEmail: string;
  privateKey: string;
  mailbox: string;
  source: "settings" | "env";
};

export function gmailFake(): boolean {
  return process.env.GMAIL_FAKE === "1";
}

/** The saved settings, else the environment; null when neither is set up. */
export async function resolveGmailConfig(): Promise<GmailConfig | null> {
  const row = await db.googleGmailConfig.findUnique({ where: { id: "singleton" } });
  if (row) {
    if (!row.enabled) return null;
    return { clientEmail: row.clientEmail, privateKey: row.privateKey, mailbox: row.mailbox, source: "settings" };
  }
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const mailbox = process.env.GMAIL_MAILBOX;
  if (json && mailbox) {
    const parsed = parseServiceAccount(json);
    if (parsed) return { ...parsed, mailbox, source: "env" };
  }
  if (gmailFake()) return { clientEmail: "fake@fake.iam.gserviceaccount.com", privateKey: "", mailbox: "ems-reports@firsthing.earth", source: "env" };
  return null;
}

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessToken(cfg: GmailConfig): Promise<string> {
  const key = `${cfg.clientEmail}|${cfg.mailbox}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: cfg.clientEmail, sub: cfg.mailbox, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(cfg.privateKey, "base64url");
  } catch {
    throw new GmailError("The service account's private key could not be read. Paste the whole JSON key file again.", 0);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const why = body.error === "unauthorized_client"
      ? "Domain-wide delegation is not granted for this service account (or not for the gmail.readonly scope) in the Workspace admin console."
      : body.error === "invalid_grant" && /signature|not found|account/i.test(body.error_description ?? "")
        ? `Google does not recognise this key (${body.error_description}). The key may be deleted or pasted incompletely — download a new one.`
        : body.error === "invalid_grant"
          ? `Google refused to act for ${cfg.mailbox} (${body.error_description ?? "invalid_grant"}) — it must be a real mailbox on the Workspace domain.`
          : (body.error_description ?? body.error ?? `HTTP ${res.status}`);
    throw new GmailError(why, res.status);
  }
  tokenCache.set(key, { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function call(cfg: GmailConfig, path: string): Promise<unknown> {
  const token = await accessToken(cfg);
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new GmailError(json.error?.message ?? `HTTP ${res.status}`, res.status);
  return json;
}

export type GmailMessageSummary = { id: string; threadId: string };

/** One page of message ids matching `q` (Gmail's own search syntax — e.g. `from:… subject:"…"`). */
export async function listMessages(cfg: GmailConfig, q: string, maxResults: number): Promise<GmailMessageSummary[]> {
  if (gmailFake()) {
    logger.info("gmail.fake_provider_active", { op: "list", q });
    return [];
  }
  const json = (await call(cfg, `/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`)) as { messages?: GmailMessageSummary[] };
  return json.messages ?? [];
}

export type GmailAttachmentRef = { filename: string; attachmentId: string; mimeType: string };
export type GmailMessage = { id: string; threadId: string; subject: string; receivedAt: Date; attachments: GmailAttachmentRef[] };

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string };
  parts?: GmailPart[];
};

function collectAttachments(part: GmailPart | undefined, out: GmailAttachmentRef[]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({ filename: part.filename, attachmentId: part.body.attachmentId, mimeType: part.mimeType ?? "application/octet-stream" });
  }
  for (const p of part.parts ?? []) collectAttachments(p, out);
}

/** The message's subject, received instant, and every attachment's reference (not its bytes — see getAttachment). */
export async function getMessage(cfg: GmailConfig, id: string): Promise<GmailMessage> {
  const json = (await call(cfg, `/messages/${id}?format=full`)) as {
    id: string;
    threadId: string;
    internalDate?: string;
    payload?: { headers?: Array<{ name: string; value: string }>; parts?: GmailPart[]; filename?: string; body?: { attachmentId?: string } };
  };
  const subject = json.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  const attachments: GmailAttachmentRef[] = [];
  collectAttachments(json.payload as GmailPart | undefined, attachments);
  return {
    id: json.id,
    threadId: json.threadId,
    subject,
    receivedAt: json.internalDate ? new Date(Number(json.internalDate)) : new Date(),
    attachments,
  };
}

/** The attachment's decoded bytes (Gmail returns them base64url-encoded, never inline on the message itself). */
export async function getAttachment(cfg: GmailConfig, messageId: string, attachmentId: string): Promise<Buffer> {
  const json = (await call(cfg, `/messages/${messageId}/attachments/${attachmentId}`)) as { data?: string };
  if (!json.data) throw new GmailError("The attachment returned no data.", 0);
  return Buffer.from(json.data, "base64url");
}

/** The settings screen's test: a token for the dedicated mailbox, then one bounded list call. */
export async function testGmailConfig(cfg: GmailConfig): Promise<void> {
  if (gmailFake()) return;
  const token = await accessToken(cfg);
  const res = await fetch(`${API}/messages?maxResults=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GmailError(j.error?.message ?? `HTTP ${res.status}`, res.status);
  }
}
