"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { retryDelayMs } from "@/lib/field-sync";
import { listOutbox, listSent, type OutboxItem, type SentRecord } from "./outbox-db";

/**
 * What the phone is holding, and the one way to send it (05-field.md §0.1).
 *
 * The service worker does the sending; this asks it to — on open, on regained
 * signal, on returning to the app, after a save, and on a backoff timer while
 * anything is waiting (15 s → 5 min, field-sync.ts retryDelayMs). Background
 * Sync is registered too, so Chrome may send after the app is closed, but it
 * is never the only trigger (ADR-002: it is not reliable enough alone).
 */

/** The app's core pages, kept on the phone so they open with no signal. */
const WARM_URLS = ["/field", "/field/work", "/field/scan", "/field/inspections", "/field/inspections/new", "/field/more"];

type Outbox = {
  items: OutboxItem[];
  /** What reached the office lately, and what it said. */
  sent: SentRecord[];
  pending: number;
  blocked: number;
  /** The last send found the session gone: the person must sign in again. */
  signInNeeded: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  sendNow: () => Promise<void>;
};

const Ctx = createContext<Outbox | null>(null);

export function useOutbox(): Outbox {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOutbox outside OutboxProvider");
  return v;
}

/** The field app's worker, registering it if needed and waiting until active. */
async function activeWorker(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator)) return null;
  let reg = await navigator.serviceWorker.getRegistration("/field");
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register("/field-sw.js", { scope: "/field", updateViaCache: "none" });
    } catch {
      return null;
    }
  }
  if (reg.active) return reg.active;
  const w = reg.installing ?? reg.waiting;
  if (!w) return null;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 10_000);
    w.addEventListener("statechange", () => {
      if (w.state === "activated") {
        clearTimeout(t);
        resolve();
      }
    });
  });
  return reg.active ?? null;
}

function ask(worker: ServiceWorker, message: object, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data);
    };
    worker.postMessage(message, [ch.port2]);
  });
}

export function OutboxProvider({ children, jobUrls = [] }: { children: ReactNode; jobUrls?: string[] }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [sent, setSent] = useState<SentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [signInNeeded, setSignInNeeded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, done] = await Promise.all([listOutbox(), listSent()]);
      setItems(rows);
      setSent(done);
    } catch {
      setItems([]);
    }
    setLoaded(true);
  }, []);

  const sendNow = useCallback(async () => {
    const worker = await activeWorker();
    if (!worker) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/field");
      await (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } } | undefined)?.sync?.register("ft-outbox");
    } catch {
      /* Background Sync is a bonus, never the only trigger */
    }
    await ask(worker, { type: "drain" }, 60_000);
    await refresh();
  }, [refresh]);

  // First look, and the first send.
  useEffect(() => {
    let alive = true;
    Promise.all([listOutbox(), listSent()])
      .catch(() => [[], []] as [OutboxItem[], SentRecord[]])
      .then(([rows, done]) => {
        if (!alive) return;
        setItems(rows);
        setSent(done);
        setLoaded(true);
        if (navigator.onLine) void sendNow();
      });
    return () => {
      alive = false;
    };
  }, [sendNow]);

  // The worker reports every change it makes.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "outbox-changed") return;
      if (typeof e.data.signIn === "boolean") setSignInNeeded(e.data.signIn);
      void refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  // Signal back, or back in the app: send now, no waiting.
  useEffect(() => {
    const onOnline = () => void sendNow();
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void sendNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sendNow]);

  // While something is waiting and not blocked: try again on the backoff.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const head = items[0];
    if (!head || head.state === "blocked" || signInNeeded) return;
    timer.current = setTimeout(() => void sendNow(), retryDelayMs(head.failures + head.refusals));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [items, signInNeeded, sendNow]);

  // Keep the core pages, and this person's own on-site jobs, on the phone —
  // once per session with signal, and again whenever a job is added.
  const warmKey = [...WARM_URLS, ...jobUrls].join("|");
  useEffect(() => {
    if (!navigator.onLine) return;
    try {
      if (sessionStorage.getItem("ft-field-warmed") === warmKey) return;
    } catch {
      /* storage blocked: warm anyway */
    }
    void activeWorker().then(async (w) => {
      if (!w) return;
      await ask(w, { type: "warm", urls: warmKey.split("|") }, 60_000);
      try {
        sessionStorage.setItem("ft-field-warmed", warmKey);
      } catch {
        /* fine */
      }
    });
  }, [warmKey]);

  // Tell the office how much each survey still has on this phone, so a
  // teammate submitting it is told who to chase (§0.1b). Surveys reported
  // before and now clear are reported as zero, once.
  const surveyCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of items) {
      const sid = (i.payload as { surveyId?: unknown } | null)?.surveyId;
      if (typeof sid === "string") out[sid] = (out[sid] ?? 0) + 1;
    }
    return JSON.stringify(out);
  }, [items]);
  useEffect(() => {
    if (!loaded || !navigator.onLine) return;
    let known: string[] = [];
    try {
      known = JSON.parse(sessionStorage.getItem("ft-survey-reported") ?? "[]");
    } catch {
      /* storage blocked */
    }
    const counts = JSON.parse(surveyCounts) as Record<string, number>;
    for (const k of known) if (!(k in counts)) counts[k] = 0;
    if (Object.keys(counts).length === 0) return;
    void fetch("/api/field/presence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending: counts }),
    })
      .then((r) => {
        if (!r.ok) return;
        try {
          sessionStorage.setItem("ft-survey-reported", JSON.stringify(Object.keys(counts).filter((k) => counts[k] > 0)));
        } catch {
          /* fine */
        }
      })
      .catch(() => {
        /* no signal: the next change tries again */
      });
  }, [surveyCounts, loaded]);

  const pending = items.filter((i) => i.state === "pending").length;
  const blocked = items.filter((i) => i.state === "blocked").length;

  return (
    <Ctx.Provider value={{ items, sent, pending, blocked, signInNeeded, loaded, refresh, sendNow }}>{children}</Ctx.Provider>
  );
}
