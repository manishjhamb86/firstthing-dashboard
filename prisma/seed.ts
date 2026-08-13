import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

// MS-01 walking-skeleton seed only: one admin account and one society, just
// enough for the exit criterion "an admin account logs in and lands on a
// real Server-Component page reading one row from Postgres." Real seed data
// (multiple societies, portal accounts, circuits) grows milestone by
// milestone as each one's own tables land.
async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await db.adminUser.upsert({
    where: { email: "yogesh@firsthing.earth" },
    update: {},
    create: {
      email: "yogesh@firsthing.earth",
      passwordHash,
      name: "Yogesh Kumar",
      permissions: ["manage_admins", "manage_users"],
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
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
