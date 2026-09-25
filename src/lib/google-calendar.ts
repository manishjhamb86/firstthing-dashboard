// Google Calendar client (2026-09-25). Server-only: a Workspace service
// account with domain-wide delegation, impersonating the event's organizer.
//
// Written against Google's own docs rather than pulling in `googleapis`:
// - token: a JWT signed RS256 with the service account's key, `sub` = the
//   user acted for, exchanged at https://oauth2.googleapis.com/token with
//   grant_type urn:ietf:params:oauth:grant-type:jwt-bearer (max 1 hour);
// - events: POST/PATCH/DELETE/GET /calendar/v3/calendars/primary/events,
//   `sendUpdates=all` so Google emails the invitations, and
//   `conferenceDataVersion=1` with conferenceData.createRequest
//   (hangoutsMeet) to create a Meet link.
// A plain service account (no delegation) cannot invite attendees — Google
// answers 403 — which is why delegation is required, not optional.
//
// Only calendar.events is requested: this client can read and write events on
// the calendars of the users it acts for, and nothing else.
//
// GOOGLE_CALENDAR_FAKE=1 swaps in a stand-in that answers without calling
// Google (verification without an account); it logs every call so it can
// never be mistaken for the real thing.

import { createSign, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalendarConfig = {
  clientEmail: string;
  privateKey: string;
  workspaceDomain: string;
  fallbackOrganizer: string;
  source: "settings" | "env";
};

export function calendarFake(): boolean {
  return process.env.GOOGLE_CALENDAR_FAKE === "1";
}

/** The saved settings, else the environment; null when neither is set up. */
export async function resolveCalendarConfig(): Promise<CalendarConfig | null> {
  const row = await db.googleCalendarConfig.findUnique({ where: { id: "singleton" } });
  if (row) {
    if (!row.enabled) return null;
    return { clientEmail: row.clientEmail, privateKey: row.privateKey, workspaceDomain: row.workspaceDomain, fallbackOrganizer: row.fallbackOrganizer, source: "settings" };
  }
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
  const fallback = process.env.GOOGLE_CALENDAR_ORGANIZER;
  if (json && domain && fallback) {
    const parsed = parseServiceAccount(json);
    if (parsed) return { ...parsed, workspaceDomain: domain, fallbackOrganizer: fallback, source: "env" };
  }
  if (calendarFake()) return { clientEmail: "fake@fake.iam.gserviceaccount.com", privateKey: "", workspaceDomain: "firsthing.earth", fallbackOrganizer: "calendar@firsthing.earth", source: "env" };
  return null;
}

/** Pull the two fields that matter out of the downloaded JSON key file. */
export function parseServiceAccount(json: string): { clientEmail: string; privateKey: string } | null {
  try {
    const j = JSON.parse(json) as { client_email?: string; private_key?: string; type?: string };
    if (!j.client_email || !j.private_key) return null;
    return { clientEmail: j.client_email, privateKey: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export class CalendarError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessToken(cfg: CalendarConfig, subject: string): Promise<string> {
  const key = `${cfg.clientEmail}|${subject}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: cfg.clientEmail, sub: subject, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(cfg.privateKey, "base64url");
  } catch {
    throw new CalendarError("The service account's private key could not be read. Paste the whole JSON key file again.", 0);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const why = body.error === "unauthorized_client"
      ? "Domain-wide delegation is not granted for this service account (or not for the calendar.events scope) in the Workspace admin console."
      : body.error === "invalid_grant" && /signature|not found|account/i.test(body.error_description ?? "")
        ? `Google does not recognise this key (${body.error_description}). The key may be deleted or pasted incompletely — download a new one.`
        : body.error === "invalid_grant"
          ? `Google refused to act for ${subject} (${body.error_description ?? "invalid_grant"}) — it must be a real account on the Workspace domain.`
          : (body.error_description ?? body.error ?? `HTTP ${res.status}`);
    throw new CalendarError(why, res.status);
  }
  tokenCache.set(key, { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

type GoogleEvent = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  attendees?: Array<{ email: string; responseStatus?: string }>;
};

function meetOf(e: GoogleEvent): string | null {
  return e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
}

async function call(cfg: CalendarConfig, organizer: string, method: string, path: string, body?: unknown): Promise<GoogleEvent | null> {
  const token = await accessToken(cfg, organizer);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const json = (await res.json().catch(() => ({}))) as GoogleEvent & { error?: { message?: string } };
  if (!res.ok) throw new CalendarError(json.error?.message ?? `HTTP ${res.status}`, res.status);
  return json;
}

export type PushResult = { googleEventId: string; htmlLink: string | null; meetLink: string | null };

/**
 * Create or update the event. Insert with the deterministic id; a 409 means it
 * already exists (a racing push, or an event deleted earlier and now back) —
 * patch it instead, which also restores a deleted one.
 */
export async function pushEvent(
  cfg: CalendarConfig,
  organizer: string,
  eventId: string,
  body: Record<string, unknown>,
  opts: { wantMeet: boolean; hasMeet: boolean },
): Promise<PushResult> {
  const conference = opts.wantMeet && !opts.hasMeet ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {};
  if (calendarFake()) {
    logger.info("calendar.fake_provider_active", { op: "push", eventId, organizer, attendees: (body.attendees as unknown[] | undefined)?.length ?? 0 });
    return {
      googleEventId: eventId,
      htmlLink: `https://calendar.google.com/calendar/event?eid=${eventId}`,
      meetLink: opts.wantMeet ? `https://meet.google.com/${eventId.slice(-3)}-${eventId.slice(-7, -3)}-${eventId.slice(-10, -7)}` : null,
    };
  }
  const q = "?sendUpdates=all&conferenceDataVersion=1";
  let e: GoogleEvent | null;
  try {
    e = await call(cfg, organizer, "POST", q, { id: eventId, ...body, ...conference });
  } catch (err) {
    if (!(err instanceof CalendarError) || err.status !== 409) throw err;
    e = await call(cfg, organizer, "PATCH", `/${eventId}${q}`, { ...body, ...conference });
  }
  return { googleEventId: e?.id ?? eventId, htmlLink: e?.htmlLink ?? null, meetLink: e ? meetOf(e) : null };
}

/** Remove the event from the organizer's calendar; Google tells the attendees. Already gone is fine. */
export async function deleteEvent(cfg: CalendarConfig, organizer: string, eventId: string): Promise<void> {
  if (calendarFake()) {
    logger.info("calendar.fake_provider_active", { op: "delete", eventId, organizer });
    return;
  }
  try {
    await call(cfg, organizer, "DELETE", `/${eventId}?sendUpdates=all`);
  } catch (err) {
    if (err instanceof CalendarError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

/** Who has answered the invitation, as Google has it. */
export async function readResponses(cfg: CalendarConfig, organizer: string, eventId: string): Promise<Array<{ email: string; responseStatus: string }>> {
  if (calendarFake()) return [];
  const e = await call(cfg, organizer, "GET", `/${eventId}`);
  return (e?.attendees ?? []).map((a) => ({ email: a.email.toLowerCase(), responseStatus: a.responseStatus ?? "needsAction" }));
}

/** The settings screen's test: get a token for the fallback organizer and read one page of their events. */
export async function testCalendarConfig(cfg: CalendarConfig): Promise<void> {
  if (calendarFake()) return;
  const token = await accessToken(cfg, cfg.fallbackOrganizer);
  const res = await fetch(`${API}?maxResults=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new CalendarError(j.error?.message ?? `HTTP ${res.status}`, res.status);
  }
}
