"use client";

import { useState } from "react";
import styles from "./marketing.module.css";

/**
 * The savings calculator — ported from the original page's own DOM-script
 * version to plain derived state (same arithmetic, same defaults: 1000
 * lights, 20W, 24h/day, ₹7/unit, 60% illustrative reduction) rather than
 * re-running `getElementById` + manual `input` listeners inside React.
 */
export function Calculator() {
  const [lights, setLights] = useState("1000");
  const [watts, setWatts] = useState("20");
  const [hours, setHours] = useState("24");
  const [tariff, setTariff] = useState("7");
  const [saving, setSaving] = useState(60);

  const l = Math.max(0, Number(lights) || 0);
  const w = Number(watts);
  const h = Number(hours);
  const t = Math.max(0, Number(tariff) || 0);
  const units = (l * w * h * 30) / 1000 * (saving / 100);
  const result = Math.round(units * t);

  return (
    <div className={styles.calculator}>
      <div>
        <div className={styles.fields}>
          <div>
            <label htmlFor="lights">Number of lights</label>
            <input id="lights" type="number" min={0} value={lights} onChange={(e) => setLights(e.target.value)} />
          </div>
          <div>
            <label htmlFor="watts">Wattage per light</label>
            <select id="watts" value={watts} onChange={(e) => setWatts(e.target.value)}>
              <option>12</option>
              <option>15</option>
              <option>20</option>
              <option>36</option>
            </select>
          </div>
          <div>
            <label htmlFor="hours">Operating hours/day</label>
            <select id="hours" value={hours} onChange={(e) => setHours(e.target.value)}>
              <option>12</option>
              <option>18</option>
              <option>24</option>
            </select>
          </div>
          <div>
            <label htmlFor="tariff">Electricity tariff (₹/unit)</label>
            <input id="tariff" type="number" min={0} step={0.1} value={tariff} onChange={(e) => setTariff(e.target.value)} />
          </div>
        </div>
        <label htmlFor="saving" style={{ marginTop: 22 }}>
          Illustrative energy reduction: <span>{saving}%</span>
        </label>
        <input
          type="range"
          id="saving"
          min={20}
          max={70}
          step={5}
          value={saving}
          onChange={(e) => setSaving(Number(e.target.value))}
          style={{ accentColor: "var(--green)" }}
        />
      </div>
      <div className={styles.calcResult}>
        <p className={styles.muted}>Illustrative monthly gross electricity savings</p>
        <strong>₹{result.toLocaleString("en-IN")}</strong>
        <p className={styles.muted}>{Math.round(units).toLocaleString("en-IN")} units/month</p>
        <a className={styles.btn} href="#contact">
          Get a Detailed Assessment ↗
        </a>
      </div>
    </div>
  );
}
