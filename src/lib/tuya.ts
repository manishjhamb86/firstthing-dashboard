import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { signPayload, tuyaSign } from "@/lib/tuya-sign";

/**
 * The Smart Life (Tuya) cloud client behind water tank monitoring.
 *
 * Read-only by construction: the only endpoints this module knows are the
 * token, the device list and a device's shadow properties. There is no
 * command endpoint here, deliberately — INV-08 makes the platform
 * monitor-only for pump hardware, and a client that cannot send commands is
 * the invariant enforced structurally rather than by discipline.
 *
 * Credentials come from the TankApiConfig row (editable by operations on
 * /admin/water-tanks/settings), falling back to TUYA_* env vars so a
 * server can be configured without a UI round trip. The secret never leaves
 * the server: no action returns it, and this module never logs it.
 */

export type TuyaConfig = { baseUrl: string; accessId: string; accessSecret: string };

export type TuyaDevice = {
  tuyaDeviceId: string;
  name: string;
  productName: string;
  category: string;
  isOnline: boolean;
};

export type TuyaProperty = { code: string; value: unknown; time: number };

export async function resolveTuyaConfig(): Promise<TuyaConfig | null> {
  const row = await db.tankApiConfig.findUnique({ where: { id: "singleton" } });
  if (row) return { baseUrl: row.baseUrl, accessId: row.accessId, accessSecret: row.accessSecret };
  const { TUYA_BASE_URL, TUYA_ACCESS_ID, TUYA_ACCESS_SECRET } = process.env;
  if (TUYA_ACCESS_ID && TUYA_ACCESS_SECRET) {
    return {
      baseUrl: TUYA_BASE_URL || "https://openapi.tuyain.com",
      accessId: TUYA_ACCESS_ID,
      accessSecret: TUYA_ACCESS_SECRET,
    };
  }
  return null;
}

// Token cache, keyed by accessId so a credential change never serves the old
// project's token. Tuya tokens live ~2h; refresh 5 minutes early.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

class TuyaError extends Error {
  constructor(public step: string, msg: string) {
    super(msg);
  }
}

async function tuyaGet<T>(cfg: TuyaConfig, path: string, token?: string): Promise<T> {
  const t = Date.now().toString();
  const sign = tuyaSign(
    cfg.accessSecret,
    signPayload({ accessId: cfg.accessId, accessToken: token, timestamp: t, method: "GET", path }),
  );
  const headers: Record<string, string> = {
    client_id: cfg.accessId,
    t,
    sign_method: "HMAC-SHA256",
    sign,
  };
  if (token) headers.access_token = token;

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json()) as { success: boolean; msg?: string; code?: number; result?: T };
  if (!body.success) {
    throw new TuyaError(path, `Tuya refused ${path}: ${body.msg ?? "unknown"} (code ${body.code ?? "?"})`);
  }
  return body.result as T;
}

async function getToken(cfg: TuyaConfig): Promise<string> {
  const cached = tokenCache.get(cfg.accessId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const result = await tuyaGet<{ access_token: string; expire_time: number }>(
    cfg,
    "/v1.0/token?grant_type=1",
  );
  tokenCache.set(cfg.accessId, {
    token: result.access_token,
    expiresAt: Date.now() + (result.expire_time - 300) * 1000,
  });
  return result.access_token;
}

/** Every device in the account. Verified live: /v2.0/cloud/thing/device is
 *  the listing this project type actually answers (the iot-03 listing
 *  returns empty for it, and the oem users listing is refused outright). */
export async function listTuyaDevices(cfg: TuyaConfig): Promise<TuyaDevice[]> {
  const token = await getToken(cfg);
  // page_size is capped low on this endpoint (>20 answers "param size too
  // much", found live) — paginate with last_row_key instead.
  // The result is a BARE ARRAY of devices (verified live — not the wrapped
  // {devices: []} shape other Tuya listings use), with pagination driven by
  // last_row_key when a page comes back full.
  const all: Array<Record<string, unknown>> = [];
  const PAGE = 20;
  let lastRowKey: string | undefined;
  for (let pageN = 0; pageN < 25; pageN++) {
    const path = `/v2.0/cloud/thing/device?page_size=${PAGE}${lastRowKey ? `&last_row_key=${lastRowKey}` : ""}`;
    const result = await tuyaGet<
      Array<Record<string, unknown>> | { devices?: Array<Record<string, unknown>>; last_row_key?: string }
    >(cfg, path, token);
    const pageDevices = Array.isArray(result) ? result : (result.devices ?? []);
    all.push(...pageDevices);
    if (pageDevices.length < PAGE) break;
    const key = Array.isArray(result)
      ? String(pageDevices[pageDevices.length - 1]?.id ?? "")
      : (result.last_row_key ?? "");
    if (!key || key === lastRowKey) break;
    lastRowKey = key;
  }
  return all.map((d) => ({
    tuyaDeviceId: String(d.id),
    // customName is what the operator typed in Smart Life; the bare name is
    // the product's own label and reads like a part number.
    name: String((d.customName as string) || d.name || d.id),
    productName: String(d.productName ?? ""),
    category: String(d.category ?? ""),
    isOnline: Boolean(d.isOnline),
  }));
}

export async function getTuyaShadow(cfg: TuyaConfig, deviceId: string): Promise<TuyaProperty[]> {
  const token = await getToken(cfg);
  const result = await tuyaGet<{ properties: TuyaProperty[] }>(
    cfg,
    `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
    token,
  );
  return result.properties ?? [];
}

/** The one signal the product is about. Null when the device has none. */
export function levelFromProperties(props: TuyaProperty[]): { level: number; time: number } | null {
  const p = props.find((x) => x.code === "liquid_level_percent");
  if (!p || typeof p.value !== "number") return null;
  return { level: Math.max(0, Math.min(100, p.value)), time: p.time };
}

/**
 * Mirror the account into water_tanks and refresh each level-bearing
 * device's cached state. Used by the settings page's test/sync, by the
 * half-hourly sampling job, and (best-effort) by live page loads.
 */
export async function syncTankDevices(cfg: TuyaConfig): Promise<{ devices: number; tanks: number }> {
  const devices = await listTuyaDevices(cfg);
  let tanks = 0;
  for (const d of devices) {
    let level: { level: number; time: number } | null = null;
    let hasLevelSignal = false;
    try {
      const props = await getTuyaShadow(cfg, d.tuyaDeviceId);
      level = levelFromProperties(props);
      hasLevelSignal = level !== null;
    } catch (err) {
      // A device whose shadow read fails stays listed with its cached state
      // — one flaky sensor must not fail the whole sync.
      logger.warn("tank.shadow_read_failed", { deviceId: d.tuyaDeviceId, error: String(err) });
    }
    if (hasLevelSignal) tanks++;
    await db.waterTank.upsert({
      where: { tuyaDeviceId: d.tuyaDeviceId },
      create: {
        tuyaDeviceId: d.tuyaDeviceId,
        name: d.name,
        productName: d.productName,
        category: d.category,
        hasLevelSignal,
        lastOnline: d.isOnline,
        ...(level ? { lastLevelPercent: level.level, lastReportedAt: new Date(level.time) } : {}),
      },
      update: {
        name: d.name,
        productName: d.productName,
        category: d.category,
        lastOnline: d.isOnline,
        syncedAt: new Date(),
        ...(level
          ? { hasLevelSignal: true, lastLevelPercent: level.level, lastReportedAt: new Date(level.time) }
          : {}),
      },
    });
  }
  await db.tankApiConfig.updateMany({
    where: { id: "singleton" },
    data: { lastOkAt: new Date(), lastError: null, lastDeviceCount: devices.length, lastSyncAt: new Date() },
  });
  return { devices: devices.length, tanks };
}
