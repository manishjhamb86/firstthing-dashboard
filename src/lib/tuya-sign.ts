import crypto from "node:crypto";

/**
 * Tuya OpenAPI request signing — the pure half of src/lib/tuya.ts, split out
 * so the string construction (the actual bug surface: ordering, newlines,
 * casing) unit-tests without any network.
 *
 * The scheme, per Tuya's cloud docs and verified live against the real
 * project on 2026-08-25:
 *
 *   stringToSign = METHOD \n sha256(body) \n \n path-with-query
 *   payload      = accessId [+ accessToken] + timestamp + stringToSign
 *   sign         = UPPERCASE( HMAC-SHA256(payload, accessSecret) )
 *
 * The token request signs WITHOUT a token; every business request signs WITH
 * the token spliced between accessId and timestamp. Getting that splice
 * wrong produces Tuya's "sign invalid" — with no hint which half was wrong.
 */

export const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function stringToSign(method: string, path: string, bodySha256 = EMPTY_BODY_SHA256): string {
  return `${method.toUpperCase()}\n${bodySha256}\n\n${path}`;
}

export function signPayload(input: {
  accessId: string;
  accessToken?: string;
  timestamp: string;
  method: string;
  path: string;
  bodySha256?: string;
}): string {
  return `${input.accessId}${input.accessToken ?? ""}${input.timestamp}${stringToSign(input.method, input.path, input.bodySha256)}`;
}

export function tuyaSign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").toUpperCase();
}
