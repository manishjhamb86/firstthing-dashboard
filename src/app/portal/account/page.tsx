import { redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

/**
 * Self-service password change (2026-10-20, user-asked). No grant check —
 * every portal role, whatever modules they hold, may change their own
 * credential; the page only needs a live session, same as /portal itself.
 */
export default async function PortalAccountPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);

  return (
    <>
      <PageHeader title="Your account" subtitle={viewer.name ? `${viewer.name} · ${viewer.email}` : viewer.email} />
      <Card className="max-w-md p-5">
        <CardTitle>Change password</CardTitle>
        <p className="mt-1 mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          You&apos;ll keep using this to sign in — nothing else about your account changes.
        </p>
        <ChangePasswordForm />
      </Card>
    </>
  );
}
