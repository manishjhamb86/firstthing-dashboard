import type { AdminPermission } from "@prisma/client";

export const PERMISSION_OPTIONS: { value: AdminPermission; label: string }[] = [
  { value: "manage_admins", label: "Manage admins" },
  { value: "manage_users", label: "Manage users" },
  { value: "manage_pipeline", label: "Manage pipeline" },
  { value: "manage_survey", label: "Manage survey" },
  // Added 2026-08-17. release_billing has existed in the schema since MS-08
  // and requireAccountant() enforces it, but it was never listed here — so
  // there was no way to grant it through the product and nobody could ever
  // release a month. Found by the admin-users summary strip reporting
  // "Can release billing: 0".
  //
  // CON-33 keeps it deliberately separate from the ops proxy: an account
  // that can run a calculation must not be able to release its own output.
  { value: "release_billing", label: "Release billing" },
];
