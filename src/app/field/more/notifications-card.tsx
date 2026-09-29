"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

// Push notifications (docs/engineering/19-field-app.md §18, the user's call
// 2026-09-29): new work assigned to this person, and alerts on meters they
// own. Asked for on a tap, never on page load — a permission prompt nobody
// expected is one people refuse, and Chrome then stops asking.

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
  return (await navigator.serviceWorker.getRegistration("/field")) ?? null;
}

async function readState(vapidKey: string | null): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!vapidKey) return "not_set_up";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Stop this phone's notifications — used by sign-out too. Never throws. */
export async function stopPushOnThisPhone(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/field/push", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    /* nothing to stop */
  }
}

export function NotificationsCard({ vapidKey }: { vapidKey: string | null }) {
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
        setNote("The app is not ready on this phone yet. Open it once with signal, then try again.");
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidKey) }));
      const res = await fetch("/api/field/push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setNote(j?.error ?? "The office could not save this. Try again with signal.");
        return;
      }
      setState("on");
      setNote("You will be told when work is assigned to you, and when a meter you look after raises an alert.");
    } catch {
      setNote("Notifications could not be turned on. Try again with signal.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await stopPushOnThisPhone();
    setState(await readState(vapidKey));
    setNote("Notifications are off on this phone.");
    setBusy(false);
  }

  return (
    <Card className="p-4 mb-4">
      <p className="font-semibold mb-1">Notifications</p>
      {state === "checking" && <p className="text-[var(--text-muted)]">Checking…</p>}
      {state === "unsupported" && <p className="text-[var(--text-muted)]">This browser cannot show notifications. Use Chrome, and install the app to the home screen.</p>}
      {state === "not_set_up" && <p className="text-[var(--text-muted)]">Notifications are not set up on this server yet.</p>}
      {state === "blocked" && (
        <p className="text-[var(--text-muted)]">
          Notifications are blocked for this app. Allow them in the phone&apos;s settings for this site, then come back here.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="text-[var(--text-muted)] mb-3">Get told on this phone when work is assigned to you, and when a meter you look after raises an alert.</p>
          <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-[var(--text-muted)] mb-3">On for this phone: new work assigned to you, and alerts on meters you look after.</p>
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
