/**
 * Zoho Invoice, read only (2026-09-30, user-asked: "fetch invoices info from
 * our zoho account, download invoice pdf").
 *
 * Researched against Zoho's own API docs (zoho.com/invoice/api/v3):
 * - One API root per data centre; FirsThing's account is on India's
 *   (invoice.zoho.in), so the defaults are accounts.zoho.in and
 *   www.zohoapis.in/invoice/v3.
 * - OAuth2. A "Self Client" (api-console.zoho.in) suits a single company's own
 *   account: its one-time grant code is exchanged once for a refresh token,
 *   which does not expire until revoked; each access token lasts an hour.
 * - Every call carries `Authorization: Zoho-oauthtoken …` and the
 *   organisation in `X-com-zoho-invoice-organizationid`.
 * - Limits: 100 requests a minute per organisation, and a daily allowance by
 *   plan (1,000 a day on the free plan). Calls here are spaced out.
 *
 * READ ONLY BY CONSTRUCTION, the same rule as tuya.ts and ewelink.ts: this
 * module knows the token endpoint, the organisation list, and reading an
 * invoice (as data or as its PDF). It has no call that creates, edits,
 * voids or emails anything in Zoho, and the scopes it asks for are READ.
 */

import { logger } from "@/lib/logger";

export const ZOHO_SCOPES = "ZohoInvoice.invoices.READ,ZohoInvoice.settings.READ";

const DATA_CENTERS: Record<string, { accounts: string; api: string }> = {
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in/invoice/v3" },
  com: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com/invoice/v3" },
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu/invoice/v3" },
};

export function zohoDataCenters(): string[] {
  return Object.keys(DATA_CENTERS);
}

function dc(code: string) {
  // Test-only: a local stand-in answering both the accounts and the API paths.
  // Never set on a real deployment; every use is logged by the caller's line.
  const override = process.env.ZOHO_BASE_OVERRIDE?.trim();
  if (override) return { accounts: override, api: `${override}/invoice/v3` };
  const d = DATA_CENTERS[code];
  if (!d) throw new Error(`Unknown Zoho data centre "${code}".`);
  return d;
}

const CALL_TIMEOUT_MS = 30_000;
// 100 a minute per organisation; one call every 700 ms stays well inside it
// even while a person clicks Sync during the automatic pass.
const MIN_SPACING_MS = 700;
let lastCallAt = 0;
async function paced() {
  const wait = lastCallAt + MIN_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export class ZohoError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function tokenCall(dataCenter: string, params: Record<string, string>): Promise<TokenReply> {
  await paced();
  // Zoho's own documentation passes these in the query string of the POST
  // (accounts/protocol/oauth/self-client/authorization-code-flow). A
  // form-encoded body was refused with "invalid_code" on the live account
  // (2026-09-30), so the documented form is used. The URL carries the secret:
  // it is never logged.
  const url = `${dc(dataCenter).accounts}/oauth/v2/token?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as TokenReply;
  if (!res.ok || json.error) {
    const code = json.error ?? `HTTP ${res.status}`;
    // Zoho's own word, so a failure says which of its causes it was.
    logger.warn("zoho.token_refused", { dataCenter, grantType: params.grant_type, zohoError: code, status: res.status });
    throw new ZohoError(tokenErrorSentence(code), res.status);
  }
  return json;
}

function tokenErrorSentence(code: string): string {
  if (code === "invalid_code") return "Zoho refused the grant code (invalid_code). It works once and only for the minutes chosen when it was generated, and only with the client id and secret of the same Self Client. Generate a new one and paste it straight away.";
  if (code === "invalid_client" || code === "invalid_client_secret") return "Zoho does not recognise that client id and secret together — copy both again from the Self Client's Client Secret tab.";
  if (code === "invalid_token") return "Zoho no longer accepts the saved connection (the refresh token was revoked). Reconnect with a new grant code.";
  return `Zoho refused the sign-in (${code}).`;
}

/** Exchange a Self Client's one-time grant code for a refresh token. */
export async function exchangeGrantCode(input: { dataCenter: string; clientId: string; clientSecret: string; code: string }) {
  const r = await tokenCall(input.dataCenter, {
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
  });
  if (!r.refresh_token || !r.access_token) {
    throw new ZohoError("Zoho gave no refresh token for that code. Generate the code with the scopes shown on this page and try again.", null);
  }
  return { refreshToken: r.refresh_token, accessToken: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in ?? 3600) * 1000) };
}

export async function refreshAccessToken(input: { dataCenter: string; clientId: string; clientSecret: string; refreshToken: string }) {
  const r = await tokenCall(input.dataCenter, {
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  if (!r.access_token) throw new ZohoError("Zoho gave no access token.", null);
  return { accessToken: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in ?? 3600) * 1000) };
}

export type ZohoSession = { dataCenter: string; accessToken: string; organizationId: string };

async function apiGet(session: ZohoSession, path: string, query: Record<string, string | number> = {}, accept: "json" | "pdf" = "json"): Promise<Response> {
  const url = new URL(`${dc(session.dataCenter).api}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  if (accept === "pdf") url.searchParams.set("accept", "pdf");
  for (let attempt = 0; ; attempt++) {
    await paced();
    const res = await fetch(url, {
      // The organisation list is the one call made before an organisation
      // is known, so the header goes only when there is one.
      headers: {
        Authorization: `Zoho-oauthtoken ${session.accessToken}`,
        ...(session.organizationId ? { "X-com-zoho-invoice-organizationid": session.organizationId } : {}),
      },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    // The minute's allowance: wait it out once, then give up for this pass.
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 61_000));
      continue;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      throw new ZohoError(apiErrorSentence(res.status, body.code ?? null, body.message), res.status, body.code ?? null);
    }
    return res;
  }
}

function apiErrorSentence(status: number, code: number | null, message?: string): string {
  if (status === 401) return "Zoho did not accept the access token.";
  if (status === 429) return "Zoho's call allowance is used up for now — the next pass will continue.";
  if (code === 6041 || /organization/i.test(message ?? "")) return `Zoho refused the organisation id (${message ?? status}).`;
  return `Zoho answered ${status}${message ? `: ${message}` : ""}.`;
}

async function json<T>(session: ZohoSession, path: string, query: Record<string, string | number> = {}): Promise<T> {
  const res = await apiGet(session, path, query);
  const body = (await res.json()) as T & { code?: number; message?: string };
  if (typeof body.code === "number" && body.code !== 0) throw new ZohoError(`Zoho answered: ${body.message ?? body.code}.`, res.status, body.code);
  return body;
}

export type ZohoOrganization = { organization_id: string; name: string };

export async function listOrganizations(session: Omit<ZohoSession, "organizationId"> & { organizationId?: string }): Promise<ZohoOrganization[]> {
  const r = await json<{ organizations?: ZohoOrganization[] }>({ ...session, organizationId: session.organizationId ?? "" }, "/organizations");
  return r.organizations ?? [];
}

/** One row of the invoice list — enough to decide whether to fetch the whole invoice. */
export type ZohoInvoiceSummary = {
  invoice_id: string;
  invoice_number: string;
  date: string;
  status: string;
  customer_name: string;
  total: number;
  last_modified_time: string;
};

/** Every invoice, a page (200) at a time, oldest first. */
export async function listInvoices(session: ZohoSession, opts: { dateFrom?: string | null; maxPages?: number } = {}): Promise<ZohoInvoiceSummary[]> {
  const out: ZohoInvoiceSummary[] = [];
  const maxPages = opts.maxPages ?? 25;
  for (let page = 1; page <= maxPages; page++) {
    const q: Record<string, string | number> = { page, per_page: 200, sort_column: "date", sort_order: "A" };
    if (opts.dateFrom) q.date_start = opts.dateFrom;
    const r = await json<{ invoices?: ZohoInvoiceSummary[]; page_context?: { has_more_page?: boolean } }>(session, "/invoices", q);
    out.push(...(r.invoices ?? []));
    if (!r.page_context?.has_more_page) break;
  }
  return out;
}

export async function getInvoice(session: ZohoSession, invoiceId: string): Promise<ZohoInvoice> {
  const r = await json<{ invoice: ZohoInvoice }>(session, `/invoices/${encodeURIComponent(invoiceId)}`);
  return r.invoice;
}

/** The invoice exactly as Zoho prints it. */
export async function getInvoicePdf(session: ZohoSession, invoiceId: string): Promise<Uint8Array> {
  const res = await apiGet(session, `/invoices/${encodeURIComponent(invoiceId)}`, {}, "pdf");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new ZohoError("Zoho did not return a PDF for that invoice.", res.status);
  }
  return bytes;
}

// The fields of a full invoice this app reads. Zoho sends many more.
export type ZohoLineItem = {
  line_item_id?: string;
  name?: string;
  description?: string;
  hsn_or_sac?: string;
  quantity?: number;
  rate?: number;
  discount?: number | string;
  discount_amount?: number;
  item_total?: number;
  tax_percentage?: number;
  line_item_taxes?: Array<{ tax_name?: string; tax_amount?: number }>;
};

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  reference_number?: string;
  date: string;
  due_date?: string;
  status: string;
  customer_name?: string;
  gst_no?: string;
  place_of_supply?: string;
  billing_address?: { attention?: string; address?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string };
  line_items?: ZohoLineItem[];
  sub_total?: number;
  tax_total?: number;
  taxes?: Array<{ tax_name?: string; tax_amount?: number }>;
  total?: number;
  balance?: number;
  payment_made?: number;
  last_payment_date?: string;
  notes?: string;
  custom_fields?: Array<{ label?: string; value?: string | number; value_formatted?: string }>;
  last_modified_time?: string;
};
