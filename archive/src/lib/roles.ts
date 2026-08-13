export type Role = "admin" | "customer" | "inspection" | "socmgr";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  customer: "/",
  inspection: "/inspection",
  socmgr: "/socmgr",
};

export function isRole(value: string | null | undefined): value is Role {
  return (
    value === "admin" ||
    value === "customer" ||
    value === "inspection" ||
    value === "socmgr"
  );
}
