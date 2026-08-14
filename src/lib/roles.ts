// MS-02: society-portal roles (office-bearer/committee/manager, FEAT-108)
// land alongside the Profile-based login path. "admin" is still resolved
// from its own AdminUser table (INV-01) — these three are resolved from
// Profile.portalAuthority and can never grant admin access.
export type Role = "admin" | "office_bearer" | "committee" | "manager";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  office_bearer: "/portal",
  committee: "/portal",
  manager: "/portal",
};

const ROLES: readonly Role[] = ["admin", "office_bearer", "committee", "manager"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPortalRole(value: unknown): value is Exclude<Role, "admin"> {
  return value === "office_bearer" || value === "committee" || value === "manager";
}
