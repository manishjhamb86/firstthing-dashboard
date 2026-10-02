import { redirect } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { sesConfigured } from "@/lib/ses";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { TestSendForm } from "./test-send-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email" };

// Operations only. Credentials are env-only (AWS_REGION/AWS_ACCESS_KEY_ID/
// AWS_SECRET_ACCESS_KEY — the same AWS account the S3 bucket already uses,
// just with its own ses:SendEmail grant), not stored in the DB: this page
// states whether SES is configured and offers a test send, it never holds a
// secret (2026-10-02, matching s3.ts's own convention rather than the
// OAuth-shaped settings pages like Zoho/Google Calendar, which genuinely
// need a UI to capture and rotate a credential).
export default async function EmailSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) redirect("/admin");
  const configured = sesConfigured();

  return (
    <>
      <PageHeader
        backHref="/admin"
        title="Email"
        subtitle="Sent through AWS SES when an invoice is released, to every portal account holding the billing grant for that society."
        chip={configured ? <StatusChip tone="ok">Configured</StatusChip> : <StatusChip tone="neu">Not configured</StatusChip>}
      />
      <div className="max-w-2xl">
        <Card className="p-6">
          <CardTitle>Connection</CardTitle>
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {configured ? (
              <>
                Sending from <strong className="num">{process.env.SES_FROM_EMAIL}</strong> via{" "}
                <strong className="num">{process.env.AWS_REGION}</strong>.
              </>
            ) : (
              <>Set <strong>SES_FROM_EMAIL</strong> and <strong>AWS_REGION</strong> in the server&rsquo;s environment, and give
              the AWS credentials already in use for S3 an <strong>ses:SendEmail</strong> permission (or a separate IAM user
              with just that). The sending address has to be a verified identity in the SES console; a new SES account also
              starts in the sandbox, where it can only send to addresses that are themselves verified — request production
              access there before relying on this for real deliveries.</>
            )}
          </p>
          {configured && <TestSendForm />}
        </Card>
      </div>
    </>
  );
}
