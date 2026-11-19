"use client";

import { useMemo, useState } from "react";
import { dayAxis, formatDate, monthLabel, weekdayShort } from "@/lib/format-date";

/**
 * The society's pump room, phone first (2026-11-19, user-asked: "mobile design
 * is cluttered and most of the info is unreadable"; designed on the canvas
 * "Pump room on a phone"). One big saved figure with two plain rows under it,
 * one sentence for efficiency, one switchable chart instead of three, and the
 * day table as a list a thumb can read. No estimate or tariff marks — the
 * society's view carries none (the user's call, same day); the back office's
 * PumpSavingsPanel keeps them. Every figure comes from the same savings view
 * the back office reads, so the two cannot disagree.
 */
export type PortalPumpDay = { day: string; kwh: number; kl: number; savedKwh: number };

export type PortalPumpData = {
  tariff: number | null;
  baselineKwhPerKl: number;
  baselineFrom: string;
  baselineTo: string;
  savingsFrom: string;
  yesterday: string;
  now: { kwhPerKl: number; from: string } | null;
  overall: { savedKwh: number; savedValue: number | null };
  month: { period: string; savedKwh: number; savedValue: number | null; days: number };
  last: { day: string; savedKwh: number; savedValue: number | null } | null;
  /** Oldest first. */
  days: PortalPumpDay[];
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-IN");

type Metric = "saved" | "kwh" | "kl";

export function PumpSavingsPortal({ data }: { data: PortalPumpData }) {
  const { tariff } = data;
  const money = (kwh: number, value: number | null) => (value !== null ? inr(value) : `${num(kwh)} kWh`);
  const changePct = data.now ? (data.now.kwhPerKl / data.baselineKwhPerKl - 1) * 100 : null;
  const nowBar = data.now ? Math.max(4, Math.min(100, (data.now.kwhPerKl / data.baselineKwhPerKl) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Money saved" className="card overflow-hidden">
          <div className="px-5 pb-4 pt-5" style={{ background: "var(--ok-bg)" }}>
            <p className="text-[14px] font-semibold" style={{ color: "var(--ok-fg)" }}>
              Saved since the automation started
            </p>
            <p className="mt-1.5 text-[40px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: "var(--ok-fg)" }}>
              {money(data.overall.savedKwh, data.overall.savedValue)}
            </p>
            <p className="mt-2 text-[15px]" style={{ color: "var(--ok-fg)" }}>
              {data.overall.savedValue !== null ? `${num(data.overall.savedKwh)} kWh of electricity · ` : "of electricity · "}since {formatDate(data.savingsFrom)}
            </p>
          </div>
          <dl>
            <Row label={`${monthLabel(data.month.period).split(" ")[0]} so far`} value={money(data.month.savedKwh, data.month.savedValue)} sub={data.month.savedValue !== null ? `${num(data.month.savedKwh)} kWh` : `${data.month.days} days`} />
            {data.last && (
              <Row label={`Yesterday, ${dayAxis(data.last.day)}`} value={money(data.last.savedKwh, data.last.savedValue)} sub={data.last.savedValue !== null ? `${num(data.last.savedKwh)} kWh` : ""} />
            )}
          </dl>
        </section>

        <section aria-label="Electricity per kilolitre" className="card flex flex-col gap-3.5 p-5">
          {changePct !== null ? (
            <p className="text-[20px] font-bold leading-snug">
              <span style={{ color: changePct < 0 ? "var(--ok-fg)" : "var(--warn-fg)" }}>
                {Math.abs(changePct).toFixed(0)}% {changePct < 0 ? "less" : "more"}
              </span>{" "}
              electricity for every kilolitre of water pumped
            </p>
          ) : (
            <p className="text-[17px] font-bold leading-snug">Electricity for every kilolitre of water pumped</p>
          )}
          <Compare label="Before FirsThing" value={`${data.baselineKwhPerKl.toFixed(2)} kWh per KL`} pct={100} color="var(--text-subtle)" />
          {data.now ? (
            <Compare label="Now" value={`${data.now.kwhPerKl.toFixed(2)} kWh per KL`} pct={nowBar} color="var(--accent)" strong />
          ) : (
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>The comparison appears once a day is read.</p>
          )}
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Before: {formatDate(data.baselineFrom)} – {formatDate(data.baselineTo)}.{data.now ? ` Now: ${dayAxis(data.now.from)} – ${dayAxis(data.yesterday)}.` : ""}
          </p>
        </section>
      </div>

      <TrendCard days={data.days} tariff={tariff} />
      <DayList days={data.days} tariff={tariff} />

      <p className="px-1 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        How a day&apos;s saving is worked out: the electricity the old pumps would have used for that day&apos;s water ({data.baselineKwhPerKl.toFixed(2)} kWh per KL), less what the pumps actually used.
      </p>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t px-5 py-3.5" style={{ borderColor: "var(--border-subtle)" }}>
      <dt className="text-[15px]" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right">
        <span className="block text-[17px] font-bold tabular-nums">{value}</span>
        {sub && <span className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>{sub}</span>}
      </dd>
    </div>
  );
}

function Compare({ label, value, pct, color, strong }: { label: string; value: string; pct: number; color: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-[14px]">
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className={`tabular-nums ${strong ? "font-bold" : "font-semibold"}`}>{value}</span>
      </div>
      <div className="h-3 rounded-full" style={{ background: "var(--surface-sunken)" }}>
        <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function TrendCard({ days, tariff }: { days: PortalPumpDay[]; tariff: number | null }) {
  const [metric, setMetric] = useState<Metric>("saved");
  const last14 = days.slice(-14);
  const valueOf = (d: PortalPumpDay) => (metric === "saved" ? (tariff !== null ? d.savedKwh * tariff : d.savedKwh) : metric === "kwh" ? d.kwh : d.kl);
  const fmt = (v: number) => (metric === "saved" ? (tariff !== null ? inr(v) : `${num(v)} kWh`) : metric === "kwh" ? `${num(v)} kWh` : `${num(v)} KL`);
  const values = last14.map(valueOf);
  const max = Math.max(1, ...values);
  const bestIdx = values.reduce((bi, v, i) => (v > values[bi] ? i : bi), 0);
  const avg = values.length ? values.reduce((a, v) => a + v, 0) / values.length : 0;
  const caption = metric === "saved" ? (tariff !== null ? "₹ saved per day" : "kWh saved per day") : metric === "kwh" ? "Electricity used per day" : "Water pumped per day";
  const tabs: { id: Metric; label: string }[] = [
    { id: "saved", label: "Saved" },
    { id: "kwh", label: "Electricity" },
    { id: "kl", label: "Water" },
  ];
  if (last14.length === 0) return null;
  const mid = last14[Math.floor((last14.length - 1) / 2)];

  return (
    <section aria-label={`Last ${last14.length} days`} className="card flex flex-col gap-3.5 px-4 py-5 sm:px-5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[17px] font-bold">Last {last14.length} days</h2>
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{caption}</span>
      </div>
      <div role="tablist" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-[12px] p-1" style={{ background: "var(--surface-sunken)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={metric === t.id}
            onClick={() => setMetric(t.id)}
            className="h-10 rounded-[9px] text-[14px] font-semibold"
            style={metric === t.id ? { background: "var(--surface)", color: "var(--text)", boxShadow: "var(--e1)" } : { color: "var(--text-muted)" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 px-1">
        <div className="flex h-[140px] items-end gap-1.5 border-b" style={{ borderColor: "var(--border)" }} role="img" aria-label={`${caption}, ${dayAxis(last14[0].day)} to ${dayAxis(last14[last14.length - 1].day)}`}>
          {last14.map((d, i) => (
            <div
              key={d.day}
              title={`${dayAxis(d.day)} · ${fmt(values[i])}`}
              className="flex-1 rounded-t-[6px]"
              style={{ height: `${Math.max(3, (values[i] / max) * 140)}px`, background: i === last14.length - 1 ? "var(--accent)" : "var(--chart-mark)", opacity: i === last14.length - 1 ? 1 : 0.55 }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span>{dayAxis(last14[0].day)}</span>
          <span>{dayAxis(mid.day)}</span>
          <span>{dayAxis(last14[last14.length - 1].day)}</span>
        </div>
      </div>
      <p className="px-1 text-[14px]" style={{ color: "var(--text-muted)" }}>
        {metric === "saved" ? "Best day" : "Highest"} <strong style={{ color: "var(--text)" }}>{dayAxis(last14[bestIdx].day)} · {fmt(values[bestIdx])}</strong>
        &nbsp;·&nbsp; Average <strong style={{ color: "var(--text)" }}>{fmt(avg)}</strong>
      </p>
    </section>
  );
}

function DayList({ days, tariff }: { days: PortalPumpDay[]; tariff: number | null }) {
  const months = useMemo(() => {
    const m = new Map<string, PortalPumpDay[]>();
    for (const d of [...days].reverse()) {
      const k = d.day.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()];
  }, [days]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(months.length ? [months[0][0]] : []));
  if (months.length === 0) return null;
  const saved = (d: PortalPumpDay) => (tariff !== null ? inr(d.savedKwh * tariff) : `${num(d.savedKwh)} kWh`);

  return (
    <section aria-label="Day by day" className="flex flex-col gap-2.5">
      {months.map(([period, rows]) => {
        const isOpen = open.has(period);
        const totalKwh = rows.reduce((a, d) => a + d.savedKwh, 0);
        const total = tariff !== null ? inr(totalKwh * tariff) : `${num(totalKwh)} kWh`;
        const toggle = () =>
          setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(period)) next.delete(period);
            else next.add(period);
            return next;
          });
        return (
          <div key={period} className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={isOpen}
              className={isOpen ? "flex items-baseline justify-between gap-3 px-1 text-left" : "card flex min-h-12 items-center justify-between gap-3 px-4 text-left"}
            >
              <span className={isOpen ? "text-[17px] font-bold" : "text-[15px] font-semibold"}>{monthLabel(period)}</span>
              <span className="text-[14px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>{total}</strong> saved · {rows.length} day{rows.length === 1 ? "" : "s"} {isOpen ? "▴" : "▾"}
              </span>
            </button>
            {isOpen && (
              <ul className="card overflow-hidden">
                {rows.map((d, i) => (
                  <li key={d.day} className={`flex min-h-16 items-center gap-3 px-4 py-2.5 ${i === 0 ? "" : "border-t"}`} style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="w-[56px] flex-none">
                      <span className="block text-[16px] font-bold">{dayAxis(d.day)}</span>
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{weekdayShort(d.day)}</span>
                    </div>
                    <div className="min-w-0 flex-1 text-[13px] leading-snug tabular-nums" style={{ color: "var(--text-muted)" }}>
                      <span className="block">{num(d.kwh)} kWh used</span>
                      <span>{num(d.kl)} KL pumped</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[16px] font-bold tabular-nums" style={{ color: "var(--ok-fg)" }}>{saved(d)}</span>
                      {tariff !== null && <span className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>{num(d.savedKwh)} kWh saved</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
