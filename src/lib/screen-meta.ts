export type ScreenMeta = {
  breadcrumb: string;
  title: string;
  primaryAction?: { label: string; href: string };
};

const SCREEN_META: Record<string, ScreenMeta> = {
  "/admin": {
    breadcrumb: "ADMIN / OVERVIEW",
    title: "Portfolio operations",
    primaryAction: { label: "New society", href: "/admin/societies/new" },
  },
  "/admin/societies": {
    breadcrumb: "ADMIN / SOCIETIES",
    title: "Societies",
    primaryAction: { label: "Add society", href: "/admin/societies/new" },
  },
  "/admin/users": { breadcrumb: "ADMIN / USERS", title: "Users" },
  "/admin/tanks": {
    breadcrumb: "ADMIN / WATER TANKS",
    title: "Water Tanks",
    primaryAction: { label: "Add tank", href: "/admin/tanks/new" },
  },
  "/admin/energy": { breadcrumb: "ADMIN / ENERGY", title: "Energy Data" },
  "/admin/invoices": { breadcrumb: "ADMIN / INVOICES", title: "Invoices" },
  "/admin/reports": { breadcrumb: "ADMIN / REPORTS", title: "Reports" },
  "/admin/inspection-reports": {
    breadcrumb: "ADMIN / INSPECTIONS",
    title: "Inspection Reports",
  },
  "/": { breadcrumb: "MY DASHBOARD", title: "Dashboard" },
  "/water-tanks": { breadcrumb: "WATER TANKS", title: "Water Tanks" },
  "/reports": { breadcrumb: "REPORTS", title: "Savings Reports" },
  "/inspection-reports": { breadcrumb: "INSPECTIONS", title: "Inspection Reports" },
  "/invoices": { breadcrumb: "INVOICES", title: "Invoices" },
  "/profile": { breadcrumb: "PROFILE", title: "Profile" },
  "/inspection": { breadcrumb: "INSPECTOR / TASKS", title: "My Tasks" },
  "/inspection/new": { breadcrumb: "INSPECTOR / NEW", title: "New Inspection" },
  "/inspection/history": { breadcrumb: "INSPECTOR / HISTORY", title: "My Inspections" },
  "/socmgr": { breadcrumb: "SOCIETY MANAGER", title: "Society Dashboard" },
};

function humanize(segment: string): string {
  const words = segment.replace(/-/g, " ").trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard";
}

export function getScreenMeta(pathname: string): ScreenMeta {
  if (SCREEN_META[pathname]) return SCREEN_META[pathname];

  const prefixMatches = Object.keys(SCREEN_META)
    .filter((key) => key !== "/" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length);
  if (prefixMatches.length > 0) return SCREEN_META[prefixMatches[0]];

  const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  const title = humanize(lastSegment);
  return { breadcrumb: title.toUpperCase(), title };
}
