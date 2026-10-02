import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { logger } from "@/lib/logger";

/**
 * Transactional email (2026-10-02, user-specified: AWS SES). Same convention
 * as s3.ts — no explicit `credentials`, the SDK's default provider chain
 * reads AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from env (an instance role
 * would be picked up automatically with no code change either way). This is
 * a SEPARATE AWS capability from the S3 bucket's own IAM user, which is
 * deliberately PutObject-only — sending mail needs its own ses:SendEmail
 * grant, which is an AWS-console step for whoever holds the account, not
 * something this code can set up.
 *
 * SES_FROM_EMAIL must be a verified identity (a verified address, or any
 * address on a verified domain) in the SES console for the same region —
 * an unverified sender is refused by SES itself, not by this module. A
 * brand-new SES account also starts in the sandbox, which can only send TO
 * addresses that are themselves verified — real delivery to portal users
 * needs production access requested in the SES console first.
 */
const ses = new SESv2Client({ region: process.env.AWS_REGION });

export function sesConfigured(): boolean {
  return Boolean(process.env.SES_FROM_EMAIL && process.env.AWS_REGION);
}

export async function sendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ error?: string }> {
  if (!sesConfigured()) return { error: "Email is not configured (SES_FROM_EMAIL/AWS_REGION missing)." };
  if (input.to.length === 0) return { error: "No recipient." };
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL,
        Destination: { ToAddresses: input.to },
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: input.html, Charset: "UTF-8" },
              Text: { Data: input.text, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("email.send_failed", { to: input.to, subject: input.subject, error: message });
    return { error: message };
  }
}
