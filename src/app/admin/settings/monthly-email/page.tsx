import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { TEMPLATE_WORDS } from "@/lib/monthly-close";
import { loadMonthlyCloseTemplate } from "@/lib/monthly-close-email";
import { isOps, requireBillingReader } from "@/app/admin/billing/access";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly email template" };

/**
 * The one message every society gets with its savings report and invoice
 * (2026-11-18, user-asked): editable here, filled in per society when sent.
 */
export default async function MonthlyEmailTemplatePage() {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const t = await loadMonthlyCloseTemplate();
  return (
    <>
      <PageHeader
        backHref="/admin/settings"
        title="Monthly email template"
        subtitle="One message for every society. Words in braces are filled in for each society when it is sent; the savings report and the invoice are always attached."
      />
      <TemplateEditor
        initialSubject={t.subject}
        initialBody={t.body}
        words={Object.entries(TEMPLATE_WORDS).map(([k, hint]) => ({ key: k, hint }))}
        savedNote={t.isDefault ? "Using the standard wording — nothing saved yet." : `Last saved ${t.updatedAt ? formatInstant(t.updatedAt) : ""}${t.updatedBy ? ` by ${t.updatedBy}` : ""}.`}
        canEdit={isOps(gate.actor)}
      />
    </>
  );
}
