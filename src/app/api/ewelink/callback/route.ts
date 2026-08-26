import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { exchangeCode, resolveEwelinkConfig, syncMeterDevices } from "@/lib/ewelink";
import { EWELINK_STATE_COOKIE } from "@/lib/ewelink-sign";

export const dynamic = "force-dynamic";

/**
 * Where eWeLink sends the operator back after they authorise the account.
 *
 * This lives under /api, which proxy.ts deliberately excludes, so it does
 * its own checking — and it has to do more than the usual: the request
 * arrives from an external redirect, so it is exactly the shape a forged
 * link takes. Three things must hold before a token is stored: the caller
 * is a signed-in operations admin, the `state` matches the cookie set when
 * WE started the flow, and the code exchanges cleanly.
 */
function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/meters/settings", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) {
    logger.warn("ewelink.callback_refused", { actorId: actor?.id ?? null, reason: "not operations" });
    return back(request, { authorised: "refused" });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(EWELINK_STATE_COOKIE)?.value ?? null;
  jar.delete(EWELINK_STATE_COOKIE);

  if (!code) {
    // The operator can simply decline on eWeLink's page; that is not an error.
    return back(request, { authorised: "cancelled" });
  }
  if (!state || !expected || state !== expected) {
    logger.warn("ewelink.callback_state_mismatch", { actorId: actor.id, hadCookie: Boolean(expected) });
    return back(request, { authorised: "state" });
  }

  const cfg = await resolveEwelinkConfig();
  if (!cfg) return back(request, { authorised: "unconfigured" });

  try {
    const token = await exchangeCode(cfg, code);
    await db.ewelinkApiConfig.update({
      where: { id: "singleton" },
      data: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        // CoolKit returns absolute expiry instants in milliseconds.
        accessTokenExpiresAt: new Date(token.atExpiredTime),
        refreshTokenExpiresAt: new Date(token.rtExpiredTime),
        lastError: null,
        lastOkAt: new Date(),
      },
    });
    logger.info("ewelink.authorised", { actorId: actor.id });

    // Mirror straight away: an authorisation that lands on an empty list
    // reads as a failure, and the device list is the first thing anyone
    // wants to see.
    cfg.accessToken = token.accessToken;
    cfg.accessTokenExpiresAt = new Date(token.atExpiredTime);
    cfg.refreshToken = token.refreshToken;
    cfg.refreshTokenExpiresAt = new Date(token.rtExpiredTime);
    const synced = await syncMeterDevices(cfg);
    return back(request, { authorised: "yes", devices: String(synced.devices), meters: String(synced.meters) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.ewelinkApiConfig.updateMany({ where: { id: "singleton" }, data: { lastError: message } });
    logger.warn("ewelink.authorisation_failed", { actorId: actor.id, error: message });
    return back(request, { authorised: "failed" });
  }
}
