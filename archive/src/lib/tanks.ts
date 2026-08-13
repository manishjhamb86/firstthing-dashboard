import { db } from "@/lib/db";

export type TankSummary = {
  id: string;
  tankName: string;
  location: string | null;
  capacityLiters: number | null;
  latest: {
    waterLevelPercent: number;
    currentLiters: number;
    status: string | null;
    receivedAt: string;
  } | null;
};

export async function getTanksForSociety(societyId: number): Promise<TankSummary[]> {
  const tanks = await db.tankConfiguration.findMany({
    where: { societyId },
    orderBy: { displayOrder: "asc" },
    include: {
      tankReadings: {
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  return tanks.map((tank) => {
    const latest = tank.tankReadings[0];
    return {
      id: tank.id.toString(),
      tankName: tank.tankName,
      location: tank.location,
      capacityLiters: tank.capacityLiters ? tank.capacityLiters.toNumber() : null,
      latest: latest
        ? {
            waterLevelPercent: latest.waterLevelPercent ? latest.waterLevelPercent.toNumber() : 0,
            currentLiters: latest.currentLiters ? latest.currentLiters.toNumber() : 0,
            status: latest.status,
            receivedAt: latest.receivedAt.toISOString(),
          }
        : null,
    };
  });
}
