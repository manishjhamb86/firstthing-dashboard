import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { settingsSections } from "@/lib/settings-sections";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/**
 * One Settings page in place of eight sidebar links (2026-11-19). It lists
 * only the settings this account could already open — the same rules the
 * sidebar used — and each page still checks its own permission.
 */
export default async function SettingsPage() {
  await requireAdminPage();
  const admin = (await resolveAdmin())!;
  const p = admin.permissions as string[];
  const sections = settingsSections({
    manageAdmins: p.includes("manage_admins"),
    billing: p.includes("manage_pipeline") || p.includes("release_billing"),
    pipeline: p.includes("manage_pipeline"),
    field: p.includes("manage_survey"),
    superAdmin: isSuperAdmin(admin.email),
  });
  if (sections.length === 0) redirect("/admin");

  return (
    <>
      <PageHeader title="Settings" subtitle="Team, business details and connected services." />
      <div className="flex flex-col gap-6">
        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`settings-${s.id}`} className="flex flex-col gap-2">
            <h2 id={`settings-${s.id}`} className="lbl">
              {s.title}
            </h2>
            <ul className="card divide-y overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {s.links.map((l) => (
                <li key={l.href} style={{ borderColor: "var(--border-subtle)" }}>
                  <Link href={l.href} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--surface-sunken)]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold">{l.label}</span>
                      <span className="block text-[13px] text-[var(--text-muted)]">{l.description}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-[var(--text-subtle)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
