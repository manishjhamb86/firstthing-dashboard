"use client";

import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import type { TankSummary } from "@/lib/tanks";

export default function WaterTanksClient({ initialTanks }: { initialTanks: TankSummary[] }) {
  const [tanks, setTanks] = useState(initialTanks);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/tanks");
      if (res.ok) {
        const data = await res.json();
        setTanks(data.tanks);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const filteredTanks = tanks.filter((tank) =>
    tank.tankName?.toLowerCase().includes(search.toLowerCase())
  );

  const healthyCount = tanks.filter((t) => t.latest?.status === "healthy").length;
  const mediumCount = tanks.filter((t) => t.latest?.status === "medium").length;
  const criticalCount = tanks.filter((t) => t.latest?.status === "critical").length;

  function getStatusStyle(status: string) {
    if (status === "healthy") {
      return { background: "var(--okb)", color: "var(--okf)" };
    }

    if (status === "medium") {
      return { background: "var(--wb)", color: "var(--wf)" };
    }

    return { background: "var(--bb)", color: "var(--bf)" };
  }

  return (
    <div className="space-y-8">

      <div>

        <h1 className="text-2xl font-bold text-ink">
          Water Tanks
        </h1>

        <p className="text-m2 mt-2">
          Real-time monitoring of water tank levels
        </p>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-card rounded-2xl p-6 border border-border">

          <div className="text-m2 text-sm">
            Total Tanks
          </div>

          <div className="text-3xl font-bold text-ink mt-2">
            {tanks.length}
          </div>

        </div>

        <div className="bg-card rounded-2xl p-6 border border-border">

          <div className="text-sm" style={{ color: "var(--okf)" }}>
            Healthy
          </div>

          <div className="text-3xl font-bold mt-2" style={{ color: "var(--okf)" }}>
            {healthyCount}
          </div>

        </div>

        <div className="bg-card rounded-2xl p-6 border border-border">

          <div className="text-sm" style={{ color: "var(--wf)" }}>
            Medium
          </div>

          <div className="text-3xl font-bold mt-2" style={{ color: "var(--wf)" }}>
            {mediumCount}
          </div>

        </div>

        <div className="bg-card rounded-2xl p-6 border border-border">

          <div className="text-sm" style={{ color: "var(--bf)" }}>
            Critical
          </div>

          <div className="text-3xl font-bold mt-2" style={{ color: "var(--bf)" }}>
            {criticalCount}
          </div>

        </div>

      </div>

      <div className="bg-card rounded-2xl p-4 border border-border">

        <input
          placeholder="Search Tank..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          className="w-full border border-border rounded-xl p-4 bg-card text-ink focus:outline-none"
        />

      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

        {filteredTanks.map((tank) => {

          const level = tank.latest?.waterLevelPercent ?? 0;
          const liters = tank.latest?.currentLiters ?? 0;
          const status = tank.latest?.status ?? "critical";

          return (

            <div
              key={tank.id}
              className="bg-card rounded-2xl border border-border p-6 hover:shadow-md transition"
            >

              <div className="flex justify-between items-start">

                <div>

                  <div className="flex items-center gap-3">

                    <Droplets
                      style={{ color: "var(--ac)" }}
                      size={28}
                    />

                    <h2 className="text-xl font-bold text-ink">
                      {tank.tankName}
                    </h2>

                  </div>

                  <p className="text-m2 mt-2">
                    {tank.location}
                  </p>

                </div>

                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={getStatusStyle(status)}
                >
                  {status}
                </span>

              </div>

              <div className="mt-8 text-center">

                <div className="text-6xl font-bold" style={{ color: "var(--ac)" }}>
                  {level}%
                </div>

              </div>

              <div className="mt-6">

                <div className="h-4 rounded-full overflow-hidden" style={{ background: "var(--card3)" }}>

                  <div
                    className="h-4 rounded-full"
                    style={{
                      width: `${level}%`,
                      background: "var(--ac)",
                    }}
                  />

                </div>

              </div>

              <div className="mt-6 text-center">

                <div className="text-lg font-semibold text-ink">
                  {liters.toLocaleString()}
                  {" / "}
                  {(tank.capacityLiters ?? 0).toLocaleString()}
                  {" L"}
                </div>

                <div className="text-m2 text-sm mt-1">
                  Current Water Level
                </div>

              </div>

              <div className="mt-6 pt-4 border-t border-border text-sm text-m2">

                <div>
                  Last Updated
                </div>

                <div className="font-medium text-ink mt-1">
                  {tank.latest?.receivedAt
                    ? new Date(
                        tank.latest.receivedAt
                      ).toLocaleString()
                    : "No Data"}
                </div>

              </div>

            </div>

          );
        })}

      </div>
    </div>
  );
}
