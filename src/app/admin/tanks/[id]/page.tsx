import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";

function statusTone(status: string | null | undefined): StatusTone {
  if (status === "healthy") return "good";
  if (status === "medium") return "warning";
  return "critical";
}

export default async function TankDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const tankId = Number(id);

  const tank = await db.tankConfiguration.findUnique({
    where: { id: tankId },
    include: { society: true },
  });

  if (!tank) notFound();

  const readings = await db.tankReading.findMany({
    where: { tankId },
    orderBy: { receivedAt: "desc" },
    take: 20,
  });

  const latestReading = readings[0];

  return (
    <div className="w-full space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-m2">Current Water</div>
          <div className="mt-2 text-xl font-bold text-ink">
            {latestReading?.currentLiters ? latestReading.currentLiters.toNumber().toLocaleString() : 0} L
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-m2">Water Level</div>
          <div className="mt-2 text-xl font-bold text-ac">
            {latestReading?.waterLevelPercent ? latestReading.waterLevelPercent.toNumber() : 0}%
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-m2">Status</div>
          <div className="mt-2">
            <StatusChip tone={statusTone(latestReading?.status)}>{(latestReading?.status ?? "No data").toUpperCase()}</StatusChip>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Tank Information</h2>
          <div className="space-y-2 text-xs text-m1">
            <p><span className="font-semibold text-ink">Society:</span> {tank.society.name}</p>
            <p><span className="font-semibold text-ink">Tank Code:</span> {tank.tankCode}</p>
            <p><span className="font-semibold text-ink">Tank Type:</span> {tank.tankType}</p>
            <p><span className="font-semibold text-ink">Location:</span> {tank.location}</p>
            <p>
              <span className="font-semibold text-ink">Capacity:</span>{" "}
              {tank.capacityLiters ? tank.capacityLiters.toNumber().toLocaleString() : 0} L
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Sensor Configuration</h2>
          <div className="space-y-2 text-xs text-m1">
            <p><span className="font-semibold text-ink">Height:</span> {tank.heightMeters ? tank.heightMeters.toNumber() : "-"} m</p>
            <p><span className="font-semibold text-ink">Sensor Offset:</span> {tank.sensorOffsetCm ? tank.sensorOffsetCm.toNumber() : "-"} cm</p>
            <p><span className="font-semibold text-ink">Low Alert:</span> {tank.lowAlertPercent.toNumber()}%</p>
            <p><span className="font-semibold text-ink">Critical Alert:</span> {tank.criticalAlertPercent.toNumber()}%</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">Vendor API Configuration</h2>
        <div className="space-y-1 text-xs text-m1">
          <p><span className="font-semibold text-ink">societyId:</span> {tank.societyId}</p>
          <p><span className="font-semibold text-ink">tankCode:</span> {tank.tankCode}</p>
        </div>

        <div className="mt-4 rounded-[10px] bg-card-3 p-3.5 overflow-x-auto">
          <pre className="text-[11px] whitespace-pre-wrap break-words text-m1">
            {JSON.stringify(
              {
                apiKey: "FIRSTHING123",
                societyId: tank.societyId,
                tankCode: tank.tankCode,
                currentLiters: 39000,
                waterLevelPercent: 78,
                sensorDistanceCm: 110,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">Recent Readings</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-border font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-m2">
                <th className="p-2.5 text-left">Time</th>
                <th className="p-2.5 text-left">Water %</th>
                <th className="p-2.5 text-left hidden sm:table-cell">Liters</th>
                <th className="p-2.5 text-left hidden md:table-cell">Distance</th>
                <th className="p-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading) => (
                <tr key={reading.id.toString()} className="border-b border-border">
                  <td className="p-2.5 text-m1">{reading.receivedAt.toLocaleString()}</td>
                  <td className="p-2.5 font-semibold text-ink">
                    {reading.waterLevelPercent ? reading.waterLevelPercent.toNumber() : "-"}%
                  </td>
                  <td className="p-2.5 hidden sm:table-cell text-m1">
                    {reading.currentLiters ? reading.currentLiters.toNumber().toLocaleString() : "-"}
                  </td>
                  <td className="p-2.5 hidden md:table-cell text-m1">
                    {reading.sensorDistanceCm ? reading.sensorDistanceCm.toNumber() : "-"} cm
                  </td>
                  <td className="p-2.5 text-m1">{reading.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
