// MS-01 scope: admin only. Society-portal roles (office-bearer/committee/
// manager, FEAT-108) land at MS-02 alongside the Profile-based login path —
// extend Role and ROLE_HOME here when that milestone starts, not before.
export type Role = "admin";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
};

export function isRole(value: unknown): value is Role {
  return value === "admin";
}
