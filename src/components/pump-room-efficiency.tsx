import { formatDate } from "@/lib/format-date";
import type { EfficiencyRow } from "@/lib/pump-room-view";

/** kWh used per kilolitre pumped, newest day first — the one figure that answers "is the pump running efficiently". */
export function PumpRoomEfficiency({ rows }: { rows: EfficiencyRow[] }) {
  const withFigure = rows.filter((r) => r.kwhPerKl !== null);
  if (withFigure.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        Shown once a day has both an electricity and a water figure.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Day</th>
            <th className="text-right">kWh per KL</th>
          </tr>
        </thead>
        <tbody>
          {withFigure.map((r) => (
            <tr key={r.day}>
              <td className="num">{formatDate(r.day)}</td>
              <td className="num text-right">{r.kwhPerKl!.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
