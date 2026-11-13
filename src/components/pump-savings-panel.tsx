import { dayAxis, formatDate, monthLabel } from "@/lib/format-date";
import type { PumpSavingsView } from "@/lib/pump-savings-loader";
import type { SavingsDay } from "@/lib/pump-savings";

/**
 * The savings story of a pump room — before vs now, what it is worth, and
 * every day since the automation went live — rendered identically on the
 * back office and the portal (2026-11-13). Hook-free.
 */
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const kwh = (v: number) => Math.round(v).toLocaleString("en-IN");

export function PumpSavingsPanel({ view, reportHref }: { view: PumpSavingsView; reportHref?: string | null }) {
  const b = view.baseline;
  const now = view.now;
  const changePct = now ? (now.kwhPerKl / b.kwhPerKl - 1) * 100 : null;
  const s = view.summary;
  const barNow = now ? Math.min(100, (now.kwhPerKl / b.kwhPerKl) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="lbl">Energy per kilolitre</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>lower is better</span>
          </div>
          <Bar label="Before FirsThing" sub={`${formatDate(b.periodFrom)} – ${formatDate(b.periodTo)}`} value={`${b.kwhPerKl.toFixed(2)} kWh/KL`} pct={100} color="var(--text-subtle)" />
          {now ? (
            <Bar label="Now" sub={`${dayAxis(now.from)} – ${dayAxis(view.yesterday)}, ${now.days} read days`} value={`${now.kwhPerKl.toFixed(2)} kWh/KL`} pct={barNow} color="var(--chart-mark)" strong />
          ) : (
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No day read in the last 30 days yet — the comparison appears once one lands.</p>
          )}
          {changePct !== null && (
            <div className="flex items-baseline gap-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
              <span className="num text-[30px] font-extrabold leading-none" style={{ color: changePct < 0 ? "var(--ok-fg)" : "var(--warn-fg)" }}>
                {changePct < 0 ? "−" : "+"}{Math.abs(changePct).toFixed(0)}%
              </span>
              <span className="text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {changePct < 0 ? "less" : "more"} electricity for every kilolitre pumped than before the automation
              </span>
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="lbl">Saved</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {view.tariff !== null ? `at ₹${view.tariff} / kWh — your recorded tariff` : "no electricity tariff on record yet"}
            </span>
          </div>
          {view.days.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Appears once a first day since {formatDate(b.savingsFrom)} is read.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Tile label={`Yesterday${s.yesterday?.estimated ? " · est." : ""}`} value={s.yesterday ? (s.yesterday.savedValue !== null ? inr(s.yesterday.savedValue) : `${kwh(s.yesterday.savedKwh)} kWh`) : "—"} sub={s.yesterday ? (s.yesterday.savedValue !== null ? `${kwh(s.yesterday.savedKwh)} kWh${s.yesterday.estimated ? " · averaged" : ""}` : s.yesterday.estimated ? "averaged" : "") : ""} muted={!!s.yesterday?.estimated} />
                <Tile label={monthLabel(s.month.period)} value={s.month.savedValue !== null ? inr(s.month.savedValue) : `${kwh(s.month.savedKwh)} kWh`} sub={`${s.month.savedValue !== null ? `${kwh(s.month.savedKwh)} kWh · ` : ""}${s.month.days} days${s.month.estimatedDays ? `, ${s.month.estimatedDays} est.` : ""}`} />
                <Tile label="Since we started" value={s.overall.savedValue !== null ? inr(s.overall.savedValue) : `${kwh(s.overall.savedKwh)} kWh`} sub={`${s.overall.savedValue !== null ? `${kwh(s.overall.savedKwh)} kWh · ` : ""}${s.overall.days} days`} good />
              </div>
              {s.overall.estimatedDays > 0 && view.readAverage && (
                <div className="flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-2" style={{ background: "var(--warn-bg)" }}>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-[2px] border border-dashed" style={{ borderColor: "var(--warn-fg)" }} />
                  <p className="text-[11.5px] leading-snug" style={{ color: "var(--warn-fg)" }}>
                    <strong>{s.overall.estimatedDays} of {s.overall.days} days are estimated.</strong> The pump runs every day, so a day with no reading is given the average of the {view.readDays} days read so far ({kwh(view.readAverage.kwh)} kWh, {kwh(view.readAverage.kl)} KL). The moment that day&apos;s reading arrives, the real figure replaces it and this mark goes.
                  </p>
                </div>
              )}
            </>
          )}
          <p className="text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
            Each day&apos;s saving is what the old {b.kwhPerKl.toFixed(2)} kWh/KL would have used for that day&apos;s water, less what the pump drew. Counted from {formatDate(b.savingsFrom)}, the day the automation went live.
          </p>
        </section>
      </div>

      {view.days.length > 0 && <DayTable days={view.days} tariff={view.tariff} baseline={b.kwhPerKl} />}

      <p className="text-[11.5px] leading-snug" style={{ color: "var(--text-subtle)" }}>
        Baseline: {b.kwh.toLocaleString("en-IN")} kWh over {b.kl.toLocaleString("en-IN")} KL, {formatDate(b.periodFrom)} – {formatDate(b.periodTo)}
        {b.sourceDocument ? <> — from <a className="font-semibold" href={reportHref ?? b.sourceDocument.href} target="_blank" rel="noreferrer">{b.sourceDocument.fileName}</a></> : null}
        {b.note ? <> · {b.note}</> : null}
      </p>
    </div>
  );
}

function Bar({ label, sub, value, pct, color, strong }: { label: string; sub: string; value: string; pct: number; color: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-[12.5px]">
        <span style={{ color: "var(--text-muted)" }}>{label} <span style={{ color: "var(--text-subtle)" }}>· {sub}</span></span>
        <span className={`num ${strong ? "font-extrabold" : "font-bold"}`} style={strong ? { color: "var(--ok-fg)" } : undefined}>{value}</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded" style={{ background: "var(--surface-active)" }}>
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, muted, good }: { label: string; value: string; sub: string; muted?: boolean; good?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[var(--r-sm)] p-2.5" style={{ background: good ? "var(--ok-bg)" : "var(--surface-active)" }}>
      <span className="lbl truncate" style={{ fontSize: 9.5, color: good ? "var(--ok-fg)" : undefined }}>{label}</span>
      <span className="num truncate text-[17px] font-extrabold leading-tight" style={{ color: good ? "var(--ok-fg)" : muted ? "var(--text-muted)" : undefined }}>{value}</span>
      <span className="num truncate text-[11px]" style={{ color: good ? "var(--ok-fg)" : "var(--text-muted)" }}>{sub}</span>
    </div>
  );
}

function DayTable({ days, tariff, baseline }: { days: SavingsDay[]; tariff: number | null; baseline: number }) {
  const newestFirst = [...days].reverse();
  const months = new Map<string, SavingsDay[]>();
  for (const d of newestFirst) {
    const m = d.day.slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(d);
  }
  const groups = [...months.entries()];
  return (
    <section className="card flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="lbl">Day by day</span>
        <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>newest first</span>
      </div>
      {groups.map(([m, rows], i) => {
        const est = rows.filter((r) => r.estimated).length;
        const saved = rows.reduce((a, r) => a + r.savedKwh, 0);
        const body = (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th align="left">Day</Th><Th>kWh</Th><Th>KL</Th><Th>kWh/KL</Th><Th>At {baseline.toFixed(2)}</Th><Th>Saved kWh</Th>{tariff !== null && <Th>Saved ₹</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day} style={r.estimated ? { color: "var(--text-subtle)", fontStyle: "italic" } : undefined}>
                    <Td align="left">
                      {dayAxis(r.day)}
                      {r.estimated && <span className="ml-1 rounded px-1 text-[9.5px] font-bold not-italic" style={{ color: "var(--warn-fg)", background: "var(--warn-bg)" }}>est.</span>}
                    </Td>
                    <Td>{r.kwh.toFixed(0)}</Td>
                    <Td>{r.kl.toFixed(0)}</Td>
                    <Td>{r.kwhPerKl === null ? "—" : r.kwhPerKl.toFixed(2)}</Td>
                    <Td muted>{(baseline * r.kl).toFixed(0)}</Td>
                    <Td good={!r.estimated}>{r.savedKwh.toFixed(0)}</Td>
                    {tariff !== null && <Td good={!r.estimated}>{inr(r.savedKwh * tariff)}</Td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-2 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <span>{rows.length} days{est ? `, ${est} est.` : ""}</span>
              <span>saved <span className="num font-bold" style={{ color: "var(--ok-fg)" }}>{kwh(saved)} kWh{tariff !== null ? ` · ${inr(saved * tariff)}` : ""}</span></span>
            </div>
          </div>
        );
        if (i === 0) return <div key={m}><p className="mb-1 text-[12px] font-semibold">{monthLabel(m)}</p>{body}</div>;
        return (
          <details key={m} className="border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
            <summary className="cursor-pointer text-[12.5px]">
              <span className="font-semibold">{monthLabel(m)}</span>
              <span style={{ color: "var(--text-subtle)" }}> · {rows.length} days{est ? `, ${est} est.` : ""} · saved {kwh(saved)} kWh{tariff !== null ? ` · ${inr(saved * tariff)}` : ""}</span>
            </summary>
            <div className="mt-2">{body}</div>
          </details>
        );
      })}
      <p className="text-[11px] leading-snug" style={{ color: "var(--text-subtle)" }}>
        <span className="font-bold" style={{ color: "var(--warn-fg)" }}>est.</span> no reading for this day yet — the average of every day read so far is shown and is replaced when the reading arrives. &quot;Now&quot; uses read days only.
      </p>
    </section>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`lbl pb-2 ${align === "left" ? "text-left" : "text-right"}`} style={{ fontSize: 10 }}>{children}</th>;
}
function Td({ children, align = "right", muted, good }: { children: React.ReactNode; align?: "left" | "right"; muted?: boolean; good?: boolean }) {
  return (
    <td className={`num whitespace-nowrap border-t py-[6px] text-[13px] ${align === "left" ? "text-left" : "text-right"} ${good ? "font-semibold" : ""}`} style={{ borderColor: "var(--border-subtle)", color: muted ? "var(--text-muted)" : good ? "var(--ok-fg)" : undefined }}>
      {children}
    </td>
  );
}
