import type { AdminPermission } from "@prisma/client";

export const PERMISSION_OPTIONS: { value: AdminPermission; label: string }[] = [
  { value: "manage_admins", label: "Manage admins" },
  { value: "manage_users", label: "Manage users" },
  { value: "manage_pipeline", label: "Manage pipeline" },
  { value: "manage_survey", label: "Manage survey" },
];
