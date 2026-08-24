import type { AdminPermission } from "@prisma/client";

/**
 * The five grants, each with the one line that says what it actually buys.
 *
 * They used to be bare nouns — "Manage pipeline", "Manage survey" — which
 * reads as jargon next to a team called Sales / Marketing and produced the
 * obvious conclusion that the right permission simply wasn't there
 * (user-reported 2026-08-24). The team's own needs are marked in the form
 * from TEAM_PERMISSIONS; this is what each one means on its own.
 */
export const PERMISSION_OPTIONS: {
  value: AdminPermission;
  label: string;
  scope: string;
}[] = [
  {
    value: "manage_admins",
    label: "Manage admins",
    scope: "Create and change internal accounts, including this screen.",
  },
  {
    value: "manage_users",
    label: "Manage users",
    scope: "Manage societies and their portal accounts.",
  },
  {
    value: "manage_pipeline",
    label: "Manage pipeline",
    scope: "Own leads and run the deal — proposal, offer, agreement. A lead can only be assigned to an account that holds this.",
  },
  {
    value: "manage_survey",
    label: "Manage survey",
    scope: "Run site surveys, commissioning and installations in the field.",
  },
  // Added 2026-08-17. release_billing has existed in the schema since MS-08
  // and requireAccountant() enforces it, but it was never listed here — so
  // there was no way to grant it through the product and nobody could ever
  // release a month. Found by the admin-users summary strip reporting
  // "Can release billing: 0".
  //
  // CON-33 keeps it deliberately separate from the ops proxy: an account
  // that can run a calculation must not be able to release its own output.
  {
    value: "release_billing",
    label: "Release billing",
    scope: "Release a calculated month to the society. Deliberately separate from running the month.",
  },
];
