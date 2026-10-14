"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

// Push notifications for water-tank alerts (2026-10-14, user-asked): a
// sensor that stops reporting, a tank critically low, or critically high /
// overflow risk. Asked for on a tap, never on page load — same reasoning as
// the field app's own card, which this mirrors: a permission prompt nobody
// expected is one people refuse, and Chrome then stops asking altogether.

type State = "checking" | "unsupported" | "not_set_up" | "blocked" | "off" | "on";

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/portal")) ?? null;
}

async function readState(vapidKey: string | null): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!vapidKey) return "not_set_up";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function PushNotificationsCard({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readState(vapidKey).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [vapidKey]);

  async function turnOn() {
    if (!vapidKey) return;
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) {
        setNote("The portal is not ready on this phone yet. Open it once more, then try again.");
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidKey) }));
      const res = await fetch("/api/portal/push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setNote(j?.error ?? "This could not be saved. Try again.");
        return;
      }
      setState("on");
      setNote("You will be told if a tank's sensor stops reporting, or a level becomes critically low or high.");
    } catch {
      setNote("Notifications could not be turned on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/portal/push", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch {
      /* nothing to stop */
    }
    setState(await readState(vapidKey));
    setNote("Notifications are off on this phone.");
    setBusy(false);
  }

  return (
    <Card className="p-4 mb-4">
      <p className="font-semibold mb-1">Water tank notifications</p>
      {state === "checking" && <p className="text-[var(--text-muted)]">Checking…</p>}
      {state === "unsupported" && <p className="text-[var(--text-muted)]">This browser cannot show notifications. Try Chrome, or install the portal to the home screen.</p>}
      {state === "not_set_up" && <p className="text-[var(--text-muted)]">Notifications are not set up on this server yet.</p>}
      {state === "blocked" && (
        <p className="text-[var(--text-muted)]">
          Notifications are blocked for this site. Allow them in your phone&apos;s settings, then come back here.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="text-[var(--text-muted)] mb-3">Get told on this phone if a tank&apos;s sensor stops reporting, or a level becomes critically low or high.</p>
          <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-[var(--text-muted)] mb-3">On for this phone — a sensor outage, or a critically low or high level.</p>
          <button type="button" className="w-full min-h-[48px] rounded-full border border-[var(--border)] bg-[var(--surface)] font-semibold" onClick={turnOff} disabled={busy}>
            Turn off on this phone
          </button>
        </>
      )}
      {note && (
        <p role="status" className="mt-3 text-[15px]">
          {note}
        </p>
      )}
    </Card>
  );
}
