import { createHmac, randomBytes } from "node:crypto";

/**
 * eWeLink request signing and payload decoding — pure, so it is testable
 * without an account. CoolKit answers any mistake here with a bare "sign
 * invalid", so both published worked examples are pinned in
 * tests/ewelink-sign.test.ts rather than discovered against the live API.
 *
 * Sources: CoolKit-Technologies/eWeLink-API, en/DeveloperGuideV2.md (the
 * signature rule) and en/OAuth2.0.md (the authorize link).
 */

/** The state cookie proves a callback answers an authorisation WE started. */
export const EWELINK_STATE_COOKIE = "ewelink_oauth_state";

/** as | us | eu | cn — CoolKit's regional hosts. India is served by Asia. */
export const EWELINK_HOSTS: Record<string, string> = {
  cn: "https://cn-apia.coolkit.cn",
  as: "https://as-apia.coolkit.cc",
  us: "https://us-apia.coolkit.cc",
  eu: "https://eu-apia.coolkit.cc",
};

export function ewelinkHost(region: string): string {
  return EWELINK_HOSTS[region] ?? EWELINK_HOSTS.as;
}

/**
 * POST endpoints sign "the entire body of the json data (http body)". The
 * caller passes the exact string it will send — re-stringifying here would
 * be a different byte sequence for the same object, which is the quiet way
 * to earn "sign invalid".
 */
export function signBody(body: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(Buffer.from(body, "utf-8")).digest("base64");
}

/**
 * GET endpoints sign the parameters "in alphabetical order and connect them
 * with &". Sorting is the rule, not an accident of insertion order — the
 * same trap already found in the Tuya client, where a single-parameter call
 * sorted by luck and page 2 would not have.
 */
export function signQuery(params: Record<string, string | number>, appSecret: string): string {
  const s = Object.keys(params)
    .filter((k) => k !== "sign")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return signBody(s, appSecret);
}

/** The authorize link's signature is over "{clientId}_{seq}". */
export function signAuthorize(clientId: string, seq: string | number, appSecret: string): string {
  return signBody(`${clientId}_${seq}`, appSecret);
}

/** "A combination of 8 uppercase or lowercase letters and numbers." */
export function nonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * The consent link the operator is sent to. `state` is ours and comes back
 * unchanged, so it is what proves the callback answers a request we started.
 */
export function authorizeUrl(opts: {
  appId: string;
  appSecret: string;
  redirectUrl: string;
  state: string;
  seq: number;
}): string {
  const q = new URLSearchParams({
    clientId: opts.appId,
    seq: String(opts.seq),
    authorization: signAuthorize(opts.appId, opts.seq, opts.appSecret),
    redirectUrl: opts.redirectUrl,
    grantType: "authorization_code",
    state: opts.state,
    nonce: nonce(),
  });
  return `https://c2ccdn.coolkit.cc/oauth/index.html?${q.toString()}`;
}

export type HundredDayDecode =
  | { ok: true; days: number[] }
  | { ok: false; reason: string };

/**
 * `hundredDaysKwhData`: "100 days of daily electricity consumption in
 * hexadecimal, expressed as an all lowercase string, 600 bytes, to two
 * decimal places", with "the current day at the top, and the others go
 * backwards". 600 characters over 100 days is 6 hex characters — three
 * bytes — per day.
 *
 * The split of those three bytes is NOT stated in the public document, and
 * a plausible-but-wrong reading here would land a wrong number in a figure a
 * society is billed on — precisely the class of defect the water-tank
 * `levelMax` bug was (a raw 45 read as 45% when the device meant 75%). So
 * this returns days the caller must CHECK before trusting: `todayAgrees()`
 * compares day 0 against the device's own separately-reported `oneKwhData`.
 * Nothing here reaches the reading store until that check passes.
 */
export function decodeHundredDaysKwh(hex: string): HundredDayDecode {
  const s = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(s)) return { ok: false, reason: "not a hex string" };
  if (s.length !== 600) return { ok: false, reason: `expected 600 hex characters, got ${s.length}` };
  const days: number[] = [];
  for (let i = 0; i < 100; i++) {
    const g = s.slice(i * 6, i * 6 + 6);
    const whole = parseInt(g.slice(0, 4), 16);
    const hundredths = parseInt(g.slice(4, 6), 16);
    if (!Number.isFinite(whole) || !Number.isFinite(hundredths)) {
      return { ok: false, reason: `day ${i} is unreadable` };
    }
    // A fractional byte above 99 means the three bytes are not
    // whole/whole/hundredths, so the reading is wrong rather than the data.
    if (hundredths > 99) return { ok: false, reason: `day ${i} has a fractional byte of ${hundredths}` };
    days.push(whole + hundredths / 100);
  }
  return { ok: true, days };
}

/**
 * The decoder's own proof. The device reports today twice — once inside the
 * hundred-day blob and once as `oneKwhData` — so they must agree, and if
 * they do not, the blob is not decoded correctly and none of it is usable.
 */
export function todayAgrees(days: number[], oneKwhData: number): boolean {
  if (days.length === 0) return false;
  return Math.abs(days[0] - oneKwhData) <= 0.011; // both are 2-decimal figures
}
