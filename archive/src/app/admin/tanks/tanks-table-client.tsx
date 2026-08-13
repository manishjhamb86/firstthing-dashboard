"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import { deleteTank } from "./actions";

type Tank = {
  id: string;
  societyName: string;
  tankName: string;
  capacityLiters: number;
  latest: {
    waterLevelPercent: number | null;
    currentLiters: number | null;
    status: string | null;
    receivedAt: string;
  } | null;
};

function statusTone(status: string | null | undefined): StatusTone {
  if (status === "healthy") return "good";
  if (status === "medium") return "warning";
  return "critical";
}

export default function TanksTableClient({ tanks }: { tanks: Tank[] }) {
  const router = useRouter();

  async function handleDelete(id: string) {
    const confirmDelete = confirm("Delete this tank?");
    if (!confirmDelete) return;

    await deleteTank(Number(id));
    router.refresh();
  }

  const healthyCount = tanks.filter((t) => t.latest?.status === "healthy").length;
  const mediumCount = tanks.filter((t) => t.latest?.status === "medium").length;
  const criticalCount = tanks.filter((t) => t.latest?.status === "critical").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-m2">Total Tanks</div>
          <div className="mt-2 text-2xl font-bold text-ink">{tanks.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--okf)" }}>
            Healthy
          </div>
          <div className="mt-2 text-2xl font-bold" style={{ color: "var(--okf)" }}>{healthyCount}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--wf)" }}>
            Medium
          </div>
          <div className="mt-2 text-2xl font-bold" style={{ color: "var(--wf)" }}>{mediumCount}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--bf)" }}>
            Critical
          </div>
          <div className="mt-2 text-2xl font-bold" style={{ color: "var(--bf)" }}>{criticalCount}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tanks.map((tank) => {
          const latest = tank.latest;
          const level = latest?.waterLevelPercent ?? 0;
          const tone = statusTone(latest?.status);

          return (
            <div key={tank.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="relative h-[64px] w-[30px] flex-none overflow-hidden rounded-[6px] border"
                    style={{ borderColor: "var(--bd3)" }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0"
                      style={{ height: `${level}%`, background: "linear-gradient(180deg, var(--lime), var(--ac))" }}
                    />
                  </div>
                  <div>
                    <Link href={`/admin/tanks/${tank.id}`} className="text-sm font-bold text-ink hover:text-ac">
                      {tank.tankName}
                    </Link>
                    <div className="mt-0.5 font-mono text-[10.5px] text-m2">{tank.societyName}</div>
                  </div>
                </div>
                <StatusChip tone={tone}>{(latest?.status ?? "no data").toUpperCase()}</StatusChip>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold tracking-[-0.5px] text-ink">{level}</span>
                <span className="text-xs font-semibold text-m1">%</span>
              </div>

              <div className="mt-2 font-mono text-[10.5px] text-m2">
                {(latest?.currentLiters ?? 0).toLocaleString()} / {tank.capacityLiters.toLocaleString()} L
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[10.5px] text-m2">
                <span>
                  {latest?.receivedAt ? new Date(latest.receivedAt).toLocaleString() : "No data"}
                </span>
                <button onClick={() => handleDelete(tank.id)} className="font-semibold" style={{ color: "var(--bf)" }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
