/**
 * The Settings page's sections (2026-11-19, navigation redesign): eight
 * sidebar links became one Settings page, as Stripe and Linear do it. Plain
 * and import-free so the client sidebar (for jump-to) and the server page
 * read the same list. Each link keeps the gate it had in the sidebar; every
 * page still checks its own permission again.
 */
export type SettingsFlags = {
  manageAdmins: boolean;
  billing: boolean;
  pipeline: boolean;
  field: boolean;
  superAdmin: boolean;
};

export type SettingsLink = { label: string; href: string; description: string };
export type SettingsSection = { id: string; title: string; links: SettingsLink[] };

export function settingsSections(f: SettingsFlags): SettingsSection[] {
  const sections: SettingsSection[] = [
    {
      id: "team",
      title: "Team",
      links: [
        f.manageAdmins && { label: "Admin users", href: "/admin/users", description: "Back-office accounts, their teams and permissions." },
        (f.manageAdmins || f.pipeline) && { label: "Member positions", href: "/admin/settings/positions", description: "The positions a society member can hold." },
      ].filter(Boolean) as SettingsLink[],
    },
    {
      id: "business",
      title: "Business",
      links: [
        f.billing && { label: "Monthly email", href: "/admin/settings/monthly-email", description: "The email sent with each month's report and bill." },
        (f.field || f.pipeline) && { label: "Offices, suppliers & items", href: "/admin/inventory/setup", description: "Where stock is kept, who it comes from, and what is tracked." },
      ].filter(Boolean) as SettingsLink[],
    },
    {
      id: "integrations",
      title: "Integrations",
      links: f.superAdmin
        ? [
            { label: "Google Calendar", href: "/admin/settings/google-calendar", description: "Tasks and meetings on people's calendars, with Meet links." },
            { label: "Google Gmail", href: "/admin/settings/google-gmail", description: "Reads the pump-room report mailbox." },
            { label: "Zoho Invoice", href: "/admin/settings/zoho", description: "Fetches invoices into Invoice intake." },
            { label: "Email", href: "/admin/settings/email", description: "Whether email sending is set up, with a test send." },
          ]
        : [],
    },
    {
      id: "data",
      title: "Data",
      links: f.superAdmin ? [{ label: "Data corrections", href: "/admin/settings/corrections", description: "Temporary switches for one-time cleanup work." }] : [],
    },
  ];
  return sections.filter((s) => s.links.length > 0);
}

/** Every route the Settings sidebar link owns, so it lights on any of them. */
export const SETTINGS_ROUTES = ["/admin/settings", "/admin/users", "/admin/inventory/setup"];
