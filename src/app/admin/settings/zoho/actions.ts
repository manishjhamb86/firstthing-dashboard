"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { exchangeGrantCode, listOrganizations, refreshAccessToken, zohoDataCenters } from "@/lib/zoho-invoice";

const PATH = "/admin/settings/zoho";

/**
 * Connect Zoho Invoice (2026-09-30). Save-and-test in one act, the rule every
 * integration here follows: nothing is stored until Zoho has accepted the
 * credentials AND listed the organisation named. The secret and the refresh
 * token are write-only — the screen never receives them; leaving the grant
 * code blank keeps the current connection and changes only the settings.
 */
export async function saveZohoConfig(input: {
  dataCenter: string;
  organizationId: string;
  clientId: string;
  clientSecret: string;
  grantCode: string;
  importFrom: string;
}): Promise<{ error?: string; organizationName?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("zoho.config_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "Connecting Zoho is an operations action." };
  }
  const dataCenter = input.dataCenter.trim();
  const organizationId = input.organizationId.trim();
  const importFrom = input.importFrom.trim();
  if (!zohoDataCenters().includes(dataCenter)) return { error: "Choose the data centre your Zoho account is on." };
  if (!/^\d{5,20}$/.test(organizationId)) return { error: "The organisation id is a number — it is shown in Zoho Invoice under your profile." };
  if (importFrom && !/^\d{4}-\d{2}-\d{2}$/.test(importFrom)) return { error: "The start date must be a date." };

  const existing = await db.zohoInvoiceConfig.findUnique({ where: { id: "singleton" } });
  const clientId = input.clientId.trim() || existing?.clientId || "";
  const clientSecret = input.clientSecret.trim() || existing?.clientSecret || "";
  if (!clientId || !clientSecret) return { error: "Paste the Self Client's client id and client secret." };

  let refreshToken: string;
  let accessToken: string;
  let expiresAt: Date;
  try {
    if (input.grantCode.trim()) {
      const t = await exchangeGrantCode({ dataCenter, clientId, clientSecret, code: input.grantCode.trim() });
      ({ refreshToken, accessToken, expiresAt } = t);
    } else {
      if (!existing) return { error: "Paste a grant code generated in the Self Client — it connects the account." };
      const t = await refreshAccessToken({ dataCenter, clientId, clientSecret, refreshToken: existing.refreshToken });
      refreshToken = existing.refreshToken;
      ({ accessToken, expiresAt } = t);
    }
    const orgs = await listOrganizations({ dataCenter, accessToken });
    const org = orgs.find((o) => o.organization_id === organizationId);
    if (!org) {
      const seen = orgs.map((o) => `${o.name} (${o.organization_id})`).join(", ");
      return { error: `That account has no organisation ${organizationId}.${seen ? ` It has: ${seen}.` : ""} Nothing was saved.` };
    }
    const data = {
      dataCenter,
      organizationId,
      organizationName: org.name,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: expiresAt,
      importFrom: importFrom ? new Date(`${importFrom}T00:00:00Z`) : null,
      enabled: true,
      updatedById: actor.id,
      lastOkAt: new Date(),
      lastError: null,
    };
    await db.zohoInvoiceConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
    logger.info("zoho.config_saved", { actorId: actor.id, organizationId, organizationName: org.name, dataCenter, newGrant: Boolean(input.grantCode.trim()) });
    revalidatePath(PATH);
    revalidatePath("/admin/billing/intake");
    return { organizationName: org.name };
  } catch (err) {
    logger.warn("zoho.config_test_failed", { actorId: actor.id, error: String(err) });
    return { error: `${err instanceof Error ? err.message : String(err)} Nothing was saved.` };
  }
}

/** Pause the automatic fetch without losing the connection. */
export async function setZohoEnabled(enabled: boolean): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) return { error: "Connecting Zoho is an operations action." };
  const r = await db.zohoInvoiceConfig.updateMany({ where: { id: "singleton" }, data: { enabled, updatedById: actor.id } });
  if (r.count === 0) return { error: "Nothing is connected yet." };
  logger.info("zoho.config_enabled", { actorId: actor.id, enabled });
  revalidatePath(PATH);
  revalidatePath("/admin/billing/intake");
  return {};
}
