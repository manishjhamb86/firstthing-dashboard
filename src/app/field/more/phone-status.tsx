"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { logoutAction } from "@/app/logout-actions";

// What this phone holds for the app (docs/engineering/19-field-app.md §3–4):
// whether it is installed, whether Chrome has agreed not to clear its saved
// data under storage pressure, and whether the offline copy is active.

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

type Status = {
  installed: boolean;
  persisted: boolean | null;
  swActive: boolean;
  usageMb: number | null;
};

async function readStatus(): Promise<Status> {
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/field") : undefined;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  return {
    installed,
    persisted,
    swActive: !!reg?.active,
    usageMb: est?.usage != null ? Math.round((est.usage / 1_048_576) * 10) / 10 : null,
  };
}

export function PhoneStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readStatus().then((s) => alive && setStatus(s));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setNote("Installed. Open FirsThing Field from your home screen.");
    setStatus(await readStatus());
  }

  // Chrome grants this on a user gesture, mostly to installed apps — which is
  // why the button exists rather than a request on page load.
  async function keepSafe() {
    if (!navigator.storage?.persist) {
      setNote("This browser cannot protect saved data. Use Chrome.");
      return;
    }
    const granted = await navigator.storage.persist();
    setNote(
      granted
        ? "Chrome will keep this app's saved data even when the phone is low on space."
        : "Chrome said no. Install the app to the home screen, then try again.",
    );
    setStatus(await readStatus());
  }

  return (
    <Card className="p-4 mb-4">
      <p className="font-semibold mb-3">This phone</p>
      {status === null ? (
        <p className="text-[var(--text-muted)]">Checking…</p>
      ) : (
        <ul className="space-y-2">
          <Row ok={status.installed} label={status.installed ? "Installed on the home screen" : "Not installed"} />
          <Row
            ok={status.persisted === true}
            label={
              status.persisted === true
                ? "Saved data is protected"
                : status.persisted === false
                  ? "Saved data can be cleared when space runs low"
                  : "Saved data protection unknown"
            }
          />
          <Row ok={status.swActive} label={status.swActive ? "Opened pages are kept for no signal" : "Offline copy not active yet"} />
          {status.usageMb !== null && (
            <li className="text-[var(--text-muted)]">Using {status.usageMb} MB on this phone</li>
          )}
        </ul>
      )}

      <div className="flex flex-col gap-2 mt-4">
        {installEvent && (
          <button type="button" className="btn-primary min-h-[48px]" onClick={install}>
            Install on the home screen
          </button>
        )}
        {status && !status.installed && !installEvent && (
          <p className="text-[var(--text-muted)]">
            To install, open the browser menu (⋮) and choose <strong>Add to Home screen</strong>.
          </p>
        )}
        {status && status.persisted !== true && (
          <button type="button" className="btn-secondary min-h-[48px]" onClick={keepSafe}>
            Keep saved data safe
          </button>
        )}
        {note && (
          <p role="status" className="text-[15px]">
            {note}
          </p>
        )}
      </div>
    </Card>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`chip ${ok ? "chip-ok" : "chip-warn"}`} aria-hidden>
        <span className="chip-dot" />
      </span>
      <span>{label}</span>
    </li>
  );
}

/**
 * Sign out, clearing the pages this phone kept first. Those pages carry this
 * person's work, and a signed-out phone should not open them from its cache
 * (05-field.md §0.7: signing out purges cached society data).
 *
 * The rule that sign-out is refused while unsent work exists arrives with the
 * outbox (19-field-app.md §8 step 3) — there is nothing unsent to protect yet.
 */
export function FieldSignOut() {
  const [pending, start] = useTransition();

  function signOut() {
    start(async () => {
      await clearKeptPages();
      await logoutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="w-full min-h-[48px] rounded-full border border-[var(--border)] bg-[var(--surface)] font-semibold"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

async function clearKeptPages(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/field");
  const worker = reg?.active;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const done = setTimeout(resolve, 2000);
    channel.port1.onmessage = () => {
      clearTimeout(done);
      resolve();
    };
    worker.postMessage({ type: "clear" }, [channel.port2]);
  });
}
