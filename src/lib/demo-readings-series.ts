// The daily series a backfilled circuit's report rests on.
//
// A circuit commissioned before this system existed has no reviewed meter
// export and no commissioning window — its evidence is the daily tables its
// demo report printed, stored per demo because two demos of one circuit can
// share dates (CON-11, FEAT-014-AC-7).

export type DemoDay = { date: string; kWh: number };
export type DemoSeries = { pre: DemoDay[]; post: DemoDay[] };

/**
 * One daily series for the whole circuit, from its demos' own tables.
 *
 * A circuit's consumption on a date is what ALL of its live demos measured
 * that date added together — Aditya Urban Casa's basement ran two demos over
 * different sets of lights, 100 and 22, and its commissioned baseline is
 * their two averages summed. Pooling the readings into one list instead
 * would average a 24 kWh day against a 1.8 kWh day and halve the figure.
 *
 * Only dates every live demo reported are usable. A date one demo missed
 * describes part of the circuit while looking like the whole of it, which
 * understates consumption — and on the post-installation side that
 * understatement inflates the saving, which is the direction that costs a
 * society money.
 */
export function circuitDailyFromDemos(
  demos: { rejected: boolean; readings: { date: string; kWh: number; phase: "pre" | "post" }[] }[],
): DemoSeries {
  const live = demos.filter((d) => !d.rejected && d.readings.length > 0);
  if (live.length === 0) return { pre: [], post: [] };

  const phase = (p: "pre" | "post"): DemoDay[] => {
    const perDemo = live.map(
      (d) => new Map(d.readings.filter((r) => r.phase === p).map((r) => [r.date, r.kWh])),
    );
    // A demo with no days in this phase cannot veto the phase for the others.
    const contributing = perDemo.filter((m) => m.size > 0);
    if (contributing.length === 0) return [];
    const shared = [...contributing[0].keys()]
      .filter((date) => contributing.every((m) => m.has(date)))
      .sort();
    return shared.map((date) => ({
      date,
      kWh: contributing.reduce((sum, m) => sum + m.get(date)!, 0),
    }));
  };

  return { pre: phase("pre"), post: phase("post") };
}
