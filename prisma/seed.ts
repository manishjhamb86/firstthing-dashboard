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
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
