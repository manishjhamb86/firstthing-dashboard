import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import TanksTableClient from "./tanks-table-client";

export default async function TanksPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const tanks = await db.tankConfiguration.findMany({
    orderBy: { displayOrder: "asc" },
    include: {
      society: true,
      tankReadings: {
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  const serializedTanks = tanks.map((tank) => {
    const latest = tank.tankReadings[0];
    return {
      id: tank.id.toString(),
      societyName: tank.society.name,
      tankName: tank.tankName,
      capacityLiters: tank.capacityLiters ? tank.capacityLiters.toNumber() : 0,
      latest: latest
        ? {
            waterLevelPercent: latest.waterLevelPercent ? latest.waterLevelPercent.toNumber() : null,
            currentLiters: latest.currentLiters ? latest.currentLiters.toNumber() : null,
            status: latest.status,
            receivedAt: latest.receivedAt.toISOString(),
          }
        : null,
    };
  });

  return <TanksTableClient tanks={serializedTanks} />;
}
