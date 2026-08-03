import type { Role } from "./roles";

export type NavBadgeKey = "societiesCount" | "unpaidInvoicesCount";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  badgeKey?: NavBadgeKey;
};

export const NAV_ITEMS: Record<Role, NavItem[]> = {
  admin: [
    { key: "dashboard", href: "/admin", label: "Dashboard" },
    { key: "societies", href: "/admin/societies", label: "Societies", badgeKey: "societiesCount" },
    { key: "users", href: "/admin/users", label: "Society Users" },
    { key: "tanks", href: "/admin/tanks", label: "Water Tanks" },
    { key: "energy", href: "/admin/energy", label: "Energy Data" },
    { key: "invoices", href: "/admin/invoices", label: "Invoices", badgeKey: "unpaidInvoicesCount" },
    { key: "reports", href: "/admin/reports", label: "Reports" },
    { key: "inspection-reports", href: "/admin/inspection-reports", label: "Inspection Reports" },
  ],
  customer: [
    { key: "dashboard", href: "/", label: "Dashboard" },
    { key: "water-tanks", href: "/water-tanks", label: "Water Tanks" },
    { key: "reports", href: "/reports", label: "Savings Reports" },
    { key: "inspection-reports", href: "/inspection-reports", label: "Inspection Reports" },
    { key: "invoices", href: "/invoices", label: "Invoices" },
    { key: "profile", href: "/profile", label: "Profile" },
  ],
  inspection: [
    { key: "dashboard", href: "/inspection", label: "Dashboard" },
    { key: "new", href: "/inspection/new", label: "New Inspection" },
    { key: "history", href: "/inspection/history", label: "My Inspections" },
  ],
  socmgr: [{ key: "dashboard", href: "/socmgr", label: "Dashboard" }],
};
