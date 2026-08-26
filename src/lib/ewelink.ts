import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ewelinkHost, nonce, signBody, signQuery } from "@/lib/ewelink-sign";

/**
 * The eWeLink (SONOFF) cloud client.
 *
 * INV-08, structurally: eWeLink's control endpoint is POST
 * /v2/device/thing/status, and these meters are switching relays — a POST
 * could de-energise a society's common-area lighting. This module knows the
 * token, refresh, device-list and status-READ endpoints and nothing else.
 * The guarantee is that the call does not exist here, not that some flag
 * forbids it. Same rule as src/lib/tuya.ts.
 *
 * See docs/engineering/14-meter-ingest-ewelink.md for the decisions.
 */

export type EwelinkConfig = {
  id: string;
  region: string;
  appId: string;
  appSecret: string;
  redirectUrl: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
};

export type EwelinkDevice = {
  deviceid: string;
  name: string;
  productModel: string;
  uiid: number;
  online: boolean;
  params: Record<string, unknown>;
};

/** Refresh this far ahead of expiry rather than on the failing request. */
const REFRESH_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

export class EwelinkNeedsAuthorisation extends Error {
  constructor(message = "The eWeLink account needs to be authorised again.") {
    super(message);
    this.name = "EwelinkNeedsAuthorisation";
  }
}

export async function resolveEwelinkConfig(): Promise<EwelinkConfig | null> {
  const row = await db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } });
  if (row?.appId && row.appSecret) {
    return {
      id: row.id,
      region: row.region,
      appId: row.appId,
      appSecret: row.appSecret,
      redirectUrl: row.redirectUrl,
      accessToken: row.accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshToken: row.refreshToken,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    };
  }
  // Env fallback, same shape as the Tuya client: useful before anything is
  // configured through the UI, never a substitute for it.
  const appId = process.env.EWELINK_APP_ID;
  const appSecret = process.env.EWELINK_APP_SECRET;
  if (!appId || !appSecret) return null;
  return {
    id: "singleton",
    region: process.env.EWELINK_REGION ?? "as",
    appId,
    appSecret,
    redirectUrl: process.env.EWELINK_REDIRECT_URL ?? "",
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken: null,
    refreshTokenExpiresAt: null,
  };
}

function headers(cfg: EwelinkConfig, authorization: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-CK-Appid": cfg.appId,
    "X-CK-Nonce": nonce(),
    Authorization: authorization,
  };
}

type EwelinkEnvelope<T> = { error: number; msg?: string; data?: T };

async function readEnvelope<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let body: EwelinkEnvelope<T>;
  try {
    body = JSON.parse(text) as EwelinkEnvelope<T>;
  } catch {
    throw new Error(`${what}: eWeLink returned non-JSON (${res.status}) ${text.slice(0, 160)}`);
  }
  // eWeLink reports failure in the envelope, not the HTTP status — a 200
  // with error: 401 is the normal shape of an expired token.
  if (body.error && body.error !== 0) {
    if (body.error === 401 || body.error === 402) throw new EwelinkNeedsAuthorisation();
    throw new Error(`${what}: eWeLink error ${body.error}${body.msg ? ` — ${body.msg}` : ""}`);
  }
  return body.data as T;
}

/** Exchange the one-time code from the consent redirect (valid 30 seconds). */
export async function exchangeCode(
  cfg: EwelinkConfig,
  code: string,
): Promise<{ accessToken: string; atExpiredTime: number; refreshToken: string; rtExpiredTime: number }> {
  const body = JSON.stringify({ code, redirectUrl: cfg.redirectUrl, grantType: "authorization_code" });
  const res = await fetch(`${ewelinkHost(cfg.region)}/v2/user/oauth/token`, {
    method: "POST",
    headers: headers(cfg, `Sign ${signBody(body, cfg.appSecret)}`),
    body,
  });
  return readEnvelope(res, "token exchange");
}

async function refreshTokens(cfg: EwelinkConfig): Promise<{ at: string; rt: string }> {
  if (!cfg.refreshToken) throw new EwelinkNeedsAuthorisation();
  if (cfg.refreshTokenExpiresAt && cfg.refreshTokenExpiresAt.getTime() <= Date.now()) {
    throw new EwelinkNeedsAuthorisation("The eWeLink refresh token has expired — authorise the account again.");
  }
  const body = JSON.stringify({ rt: cfg.refreshToken });
  const res = await fetch(`${ewelinkHost(cfg.region)}/v2/user/refresh`, {
    method: "POST",
    headers: headers(cfg, `Sign ${signBody(body, cfg.appSecret)}`),
    body,
  });
  return readEnvelope(res, "token refresh");
}

/**
 * The access token to use now, refreshed ahead of expiry. A refresh moves
 * both tokens, so the new pair is persisted before it is used — losing a
 * rotated refresh token would cost a human re-authorisation.
 */
export async function accessTokenFor(cfg: EwelinkConfig): Promise<string> {
  const expires = cfg.accessTokenExpiresAt?.getTime() ?? 0;
  if (cfg.accessToken && expires - Date.now() > REFRESH_MARGIN_MS) return cfg.accessToken;

  const fresh = await refreshTokens(cfg);
  // CoolKit's own lifetimes: access 30 days, refresh 60.
  const now = Date.now();
  await db.ewelinkApiConfig.update({
    where: { id: cfg.id },
    data: {
      accessToken: fresh.at,
      refreshToken: fresh.rt,
      accessTokenExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
      refreshTokenExpiresAt: new Date(now + 60 * 24 * 60 * 60 * 1000),
    },
  });
  cfg.accessToken = fresh.at;
  cfg.refreshToken = fresh.rt;
  logger.info("ewelink.token_refreshed", {});
  return fresh.at;
}

async function ewelinkGet<T>(
  cfg: EwelinkConfig,
  path: string,
  params: Record<string, string | number>,
  what: string,
): Promise<T> {
  const token = await accessTokenFor(cfg);
  // Parameters are sorted for the signature; sending them in the same order
  // keeps the request and what was signed obviously identical.
  const sorted = Object.keys(params).sort();
  const qs = sorted.map((k) => `${k}=${encodeURIComponent(String(params[k]))}`).join("&");
  const res = await fetch(`${ewelinkHost(cfg.region)}${path}?${qs}`, {
    method: "GET",
    headers: {
      "X-CK-Appid": cfg.appId,
      "X-CK-Nonce": nonce(),
      Authorization: `Bearer ${token}`,
      // Signed for the endpoints that want it; harmless where they do not.
      "X-CK-Sign": signQuery(params, cfg.appSecret),
    },
  });
  return readEnvelope<T>(res, what);
}

/** Every device in the account. num=0 means "all", per the API reference. */
export async function listEwelinkDevices(cfg: EwelinkConfig): Promise<EwelinkDevice[]> {
  const data = await ewelinkGet<{ thingList?: { itemData?: Record<string, unknown> }[] }>(
    cfg,
    "/v2/device/thing",
    { num: 0, lang: "en" },
    "device list",
  );
  const list = data?.thingList ?? [];
  return list
    .map((t) => t.itemData ?? {})
    .filter((d) => typeof d.deviceid === "string")
    .map((d) => ({
      deviceid: String(d.deviceid),
      name: String(d.name ?? "Unnamed device"),
      productModel: String(d.productModel ?? ""),
      uiid: Number((d.extra as { uiid?: number } | undefined)?.uiid ?? 0),
      online: Boolean(d.online),
      params: (d.params as Record<string, unknown>) ?? {},
    }));
}

/**
 * A device's live parameters. `params` narrows the read; omitting it asks
 * for everything, which is what device discovery wants.
 */
export async function getDeviceParams(
  cfg: EwelinkConfig,
  deviceId: string,
  params?: string[],
): Promise<Record<string, unknown>> {
  const query: Record<string, string | number> = { id: deviceId, type: 1 };
  if (params?.length) query.params = params.join("|");
  const data = await ewelinkGet<{ params?: Record<string, unknown> }>(
    cfg,
    "/v2/device/thing/status",
    query,
    `device ${deviceId} status`,
  );
  return data?.params ?? {};
}

/** The datapoints that mean "this device measures electricity". */
const ENERGY_KEYS = ["power", "voltage", "current", "oneKwhData", "hundredDaysKwhData", "energy"];

export function hasEnergySignal(params: Record<string, unknown>): boolean {
  return ENERGY_KEYS.some((k) => params[k] !== undefined);
}

function powerOf(params: Record<string, unknown>): number | null {
  const raw = params.power;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Mirror the account. Non-metering devices are kept and marked, not dropped:
 * a device missing from the screen reads as an account problem rather than
 * as the wrong kind of device — the same call made for the Tuya energy
 * meters on the water-tank list.
 */
export async function syncMeterDevices(cfg: EwelinkConfig): Promise<{ devices: number; meters: number }> {
  const devices = await listEwelinkDevices(cfg);
  let meters = 0;
  for (const d of devices) {
    const energy = hasEnergySignal(d.params);
    if (energy) meters++;
    await db.meterDevice.upsert({
      where: { ewelinkDeviceId: d.deviceid },
      create: {
        ewelinkDeviceId: d.deviceid,
        name: d.name,
        productModel: d.productModel,
        uiid: d.uiid,
        online: d.online,
        hasEnergySignal: energy,
        observedParams: Object.keys(d.params),
        lastPowerW: powerOf(d.params),
        lastReportedAt: energy ? new Date() : null,
      },
      update: {
        name: d.name,
        productModel: d.productModel,
        uiid: d.uiid,
        online: d.online,
        hasEnergySignal: energy,
        observedParams: Object.keys(d.params),
        ...(powerOf(d.params) === null ? {} : { lastPowerW: powerOf(d.params), lastReportedAt: new Date() }),
        syncedAt: new Date(),
      },
    });
  }
  await db.ewelinkApiConfig.update({
    where: { id: cfg.id },
    data: { lastOkAt: new Date(), lastError: null, lastDeviceCount: devices.length, lastSyncAt: new Date() },
  });
  logger.info("ewelink.devices_synced", { devices: devices.length, meters });
  return { devices: devices.length, meters };
}

/**
 * Whether the integration can still obtain a token without a human. The
 * access token expiring is routine — the server refreshes it. The REFRESH
 * token expiring is the state that needs a person, so that is what decides
 * "authorised" on screen.
 */
export function isAuthorised(cfg: {
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
} | null): boolean {
  if (!cfg?.refreshToken || !cfg.refreshTokenExpiresAt) return false;
  return cfg.refreshTokenExpiresAt.getTime() > new Date().getTime();
}

/** Whether the current access token is still usable as it stands. */
export function accessTokenValid(cfg: {
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
} | null): boolean {
  if (!cfg?.accessToken || !cfg.accessTokenExpiresAt) return false;
  return cfg.accessTokenExpiresAt.getTime() > new Date().getTime();
}
