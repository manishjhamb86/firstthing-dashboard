import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

// MS-01 seeded one admin + one society. MS-02 adds a second society (so
// NFR-05's tenancy tests have a real foreign society to probe against) and
// portal accounts (office-bearer + committee) on each, enough to log in as
// either authority and exercise GATE-04's binding-act check for real.
async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await db.adminUser.upsert({
    where: { email: "yogesh@firsthing.earth" },
    update: {},
    create: {
      email: "yogesh@firsthing.earth",
      passwordHash,
      name: "Yogesh Kumar",
      permissions: ["manage_admins", "manage_users", "manage_pipeline", "manage_survey"],
    },
  });

  await db.society.upsert({
    where: { id: "seed-society-1" },
    update: {},
    create: {
      id: "seed-society-1",
      name: "Settlement Nexus",
      flatCount: 240,
      location: "Bengaluru",
      status: "active",
    },
  });

  await db.society.upsert({
    where: { id: "seed-society-2" },
    update: {},
    create: {
      id: "seed-society-2",
      name: "ASF Insignia",
      flatCount: 180,
      location: "Gurugram",
      status: "active",
    },
  });

  await db.profile.upsert({
    where: { email: "bearer@settlement-nexus.test" },
    update: {},
    create: {
      email: "bearer@settlement-nexus.test",
      passwordHash,
      name: "Asha Rao",
      portalAuthority: "office_bearer",
      societyId: "seed-society-1",
    },
  });

  await db.profile.upsert({
    where: { email: "committee@settlement-nexus.test" },
    update: {},
    create: {
      email: "committee@settlement-nexus.test",
      passwordHash,
      name: "Vikram Singh",
      portalAuthority: "committee",
      societyId: "seed-society-1",
    },
  });

  await db.profile.upsert({
    where: { email: "bearer@asf-insignia.test" },
    update: {},
    create: {
      email: "bearer@asf-insignia.test",
      passwordHash,
      name: "Neha Kapoor",
      portalAuthority: "office_bearer",
      societyId: "seed-society-2",
    },
  });

  // CON-45 — a starter device catalog, so the inventory and replacement
  // dropdowns are usable out of the box. Upserted by name; ops grows the
  // rest from /admin/device-catalog.
  const catalogSeed: {
    name: string;
    role: "original" | "replacement";
    defaultWattage: number | null;
  }[] = [
    { name: "Tube light 20W", role: "original", defaultWattage: 20 },
    { name: "Tube light 18W", role: "original", defaultWattage: 18 },
    { name: "Surface light 12W", role: "original", defaultWattage: 12 },
    { name: "Bulb 9W", role: "original", defaultWattage: 9 },
    { name: "Ceiling fan", role: "original", defaultWattage: 60 },
    { name: "Motion-enabled batten 20W", role: "replacement", defaultWattage: 20 },
    { name: "Motion-enabled batten 18W", role: "replacement", defaultWattage: 18 },
    { name: "Motion-enabled dimmable surface 12W", role: "replacement", defaultWattage: 12 },
    { name: "Motion-enabled bulb 9W", role: "replacement", defaultWattage: 9 },
  ];
  const byName = new Map<string, string>();
  for (const t of catalogSeed) {
    const row = await db.deviceType.upsert({
      where: { name: t.name },
      update: {},
      create: { name: t.name, role: t.role, defaultWattage: t.defaultWattage },
    });
    byName.set(t.name, row.id);
  }
  const mappings: [string, string[]][] = [
    ["Tube light 20W", ["Motion-enabled batten 20W", "Motion-enabled batten 18W"]],
    ["Tube light 18W", ["Motion-enabled batten 18W", "Motion-enabled batten 20W"]],
    ["Surface light 12W", ["Motion-enabled dimmable surface 12W"]],
    ["Bulb 9W", ["Motion-enabled bulb 9W"]],
  ];
  for (const [orig, reps] of mappings) {
    for (const rep of reps) {
      const originalTypeId = byName.get(orig)!;
      const replacementTypeId = byName.get(rep)!;
      await db.deviceReplacementOption.upsert({
        where: { originalTypeId_replacementTypeId: { originalTypeId, replacementTypeId } },
        update: {},
        create: { originalTypeId, replacementTypeId },
      });
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
