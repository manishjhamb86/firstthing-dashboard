"use server";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normaliseMobile } from "@/lib/society-members";
import { refuseMarketingEnquiry, type MarketingEnquiryInput } from "@/lib/marketing-enquiry";

/**
 * The public homepage's lead-capture form (2026-10-16, user-asked: "wire the
 * backend apis for contact us"). Deliberately the one Server Action in this
 * codebase with no resolveAdmin()/resolvePortalViewer() call — the caller is
 * an anonymous visitor who has no account to resolve. It can only ever
 * create one new, inert row for the sales team to follow up on; it never
 * reads or touches anything that already exists.
 */
export async function submitMarketingEnquiry(input: MarketingEnquiryInput): Promise<{ ok: true } | { error: string }> {
  const error = refuseMarketingEnquiry(input);
  if (error) return { error };

  const mobile = normaliseMobile(input.mobile)!;
  const enquiry = await db.marketingEnquiry.create({
    data: {
      name: input.name.trim(),
      organisation: input.organisation.trim(),
      mobile,
      interest: input.interest,
    },
  });
  logger.info("marketing.enquiry_received", { enquiryId: enquiry.id, interest: input.interest });
  return { ok: true };
}
