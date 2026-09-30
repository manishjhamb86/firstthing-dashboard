"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, LifeBuoy, Mic, Square, Trash2, X } from "lucide-react";
import { useOutbox } from "./outbox-provider";
import { newItem, saveOnPhone } from "./queue";
import { preparePhoto } from "./photo";
import type { StoredPhoto } from "./outbox-db";
import { MAX_DESCRIPTION, MAX_HELP_PHOTOS, type HelpAttachmentRole } from "@/lib/help-report";

/**
 * The field app's Help button (docs/engineering/21-field-help.md). Tapping it
 * first takes a screenshot of the app screen (rendered from the page itself —
 * only the app, never the rest of the phone), then opens the sheet. The report
 * is saved on the phone and sent like any field work, so it gets through from
 * a basement with no signal.
 *
 * Voice, per the user's choice: Android dictates into the text box with the
 * phone's own speech recognition (nothing stored); iPhone records a voice note,
 * which the AI transcribes.
 */

export type HelpTask = { id: string; title: string; when: string };

// The last few errors this page hit, sent with a report so a bug arrives with
// its evidence. Kept in memory only.
const recentErrors: string[] = [];
let listening = false;
function listenForErrors() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const keep = (m: string) => {
    recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${m}`.slice(0, 300));
    if (recentErrors.length > 8) recentErrors.shift();
  };
  window.addEventListener("error", (e) => keep(e.message || "error"));
  window.addEventListener("unhandledrejection", (e) => keep(`unhandled: ${String((e as PromiseRejectionEvent).reason).slice(0, 200)}`));
}

function isIPhone(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

function speechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type VoiceMode = "dictate" | "record" | "none";
function voiceMode(): VoiceMode {
  if (isIPhone()) return typeof MediaRecorder !== "undefined" ? "record" : "none";
  if (speechCtor()) return "dictate";
  return typeof MediaRecorder !== "undefined" ? "record" : "none";
}

/** A screenshot of what is on screen: the page rendered to a canvas, cropped to the viewport. */
async function captureScreen(): Promise<Blob | null> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const full = await domToCanvas(document.body, {
      scale,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      filter: (n) => !(n instanceof HTMLElement && n.dataset.helpSkip === "true"),
      timeout: 5000,
    });
    const w = Math.round(window.innerWidth * scale);
    const h = Math.round(window.innerHeight * scale);
    const crop = document.createElement("canvas");
    // Downscale to a 1,280px long edge — plenty to read a screen, small to send.
    const shrink = Math.min(1, 1280 / Math.max(w, h));
    crop.width = Math.round(w * shrink);
    crop.height = Math.round(h * shrink);
    const ctx = crop.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(full, Math.round(window.scrollX * scale), Math.round(window.scrollY * scale), w, h, 0, 0, crop.width, crop.height);
    return await new Promise<Blob | null>((resolve) => crop.toBlob((b) => resolve(b), "image/jpeg", 0.72));
  } catch {
    return null;
  }
}

type Photo = { blob: Blob; contentType: string; fileName: string; url: string };

export function HelpButton({ tasks }: { tasks: HelpTask[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<Photo | null>(null);

  useEffect(listenForErrors, []);

  async function start() {
    setCapturing(true);
    const blob = await captureScreen();
    setShot(blob ? { blob, contentType: "image/jpeg", fileName: "screen.jpg", url: URL.createObjectURL(blob) } : null);
    setCapturing(false);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        data-help-skip="true"
        onClick={start}
        disabled={capturing}
        aria-label="Help — report a problem or ask a question"
        className="fixed right-4 z-30 flex items-center gap-2 rounded-full px-4 h-12 font-semibold shadow-lg"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom))", background: "var(--accent)", color: "var(--text-on-accent)" }}
      >
        <LifeBuoy size={20} aria-hidden />
        {capturing ? "…" : "Help"}
      </button>
      {open && <HelpSheet key={pathname} shot={shot} onRemoveShot={() => setShot(null)} tasks={tasks} onClose={() => setOpen(false)} />}
    </>
  );
}

function HelpSheet({ shot, onRemoveShot, tasks, onClose }: { shot: Photo | null; onRemoveShot: () => void; tasks: HelpTask[]; onClose: () => void }) {
  const pathname = usePathname();
  const outbox = useOutbox();
  const [text, setText] = useState("");
  const [taskId, setTaskId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [voice, setVoice] = useState<Photo | null>(null);
  const [mode] = useState<VoiceMode>(() => voiceMode());
  const [listeningNow, setListeningNow] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRef<InstanceType<SpeechCtor> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      rec.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function dictate() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listeningNow) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript;
      if (add) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${add.trim()}`.slice(0, MAX_DESCRIPTION));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") setError("Allow the microphone for this app to dictate.");
    };
    r.onend = () => setListeningNow(false);
    rec.current = r;
    r.start();
    setListeningNow(true);
  }

  async function record() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecordingSecs(null);
        const ct = (mr.mimeType || type || "audio/mp4").split(";")[0];
        const blob = new Blob(chunks, { type: ct });
        if (blob.size) setVoice({ blob, contentType: ct, fileName: `voice.${ct.includes("webm") ? "webm" : "m4a"}`, url: URL.createObjectURL(blob) });
      };
      recorder.current = mr;
      mr.start();
      setRecordingSecs(0);
      timer.current = setInterval(() => {
        setRecordingSecs((s) => {
          const n = (s ?? 0) + 1;
          if (n >= 120 && mr.state === "recording") mr.stop();
          return n;
        });
      }, 1000);
    } catch {
      setError("Allow the microphone for this app to record a voice note.");
    }
  }

  async function addPhoto(files: FileList | null) {
    if (!files) return;
    const room = MAX_HELP_PHOTOS - photos.length;
    const add: Photo[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      const p = await preparePhoto(f);
      add.push({ ...p, url: URL.createObjectURL(p.blob) });
    }
    setPhotos((ps) => [...ps, ...add]);
  }

  async function send() {
    setError(null);
    if (!text.trim() && !voice) {
      setError("Say what is wrong — type it, dictate it, or record a voice note.");
      return;
    }
    setBusy(true);
    const roles: HelpAttachmentRole[] = [];
    const stored: StoredPhoto[] = [];
    const push = (p: Photo, role: HelpAttachmentRole) => {
      roles.push(role);
      stored.push({ id: crypto.randomUUID(), blob: p.blob, contentType: p.contentType, fileName: p.fileName });
    };
    if (shot) push(shot, "screenshot");
    if (voice) push(voice, "voice");
    photos.forEach((p) => push(p, "photo"));
    const payload = {
      description: text.trim(),
      page: pathname,
      pageTitle: document.title,
      taskEventId: taskId || null,
      attachments: roles,
      clientInfo: {
        errors: [...recentErrors],
        screen: `${window.innerWidth}×${window.innerHeight}`,
        online: navigator.onLine,
        waitingToSend: outbox.pending,
        userAgent: navigator.userAgent.slice(0, 180),
      },
    };
    const label = `Help · ${(text.trim() || "voice note").slice(0, 40)}`;
    const item = newItem("help.report", payload, label, { photoIds: stored.map((p) => p.id) });
    item.upload = { purpose: "help", itemId: item.id };
    const ok = await saveOnPhone(outbox, [item], stored);
    setBusy(false);
    if (!ok) {
      setError("It could not be saved on this phone. Try again.");
      return;
    }
    setSaved(true);
  }

  return (
    <div data-help-skip="true" className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "rgba(15, 23, 42, 0.45)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl p-4 pb-8"
        style={{ background: "var(--surface)", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="help-title" className="text-[19px] font-bold">
            {saved ? "Sent to the office" : "Help"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 flex items-center justify-center rounded-full">
            <X size={20} />
          </button>
        </div>

        {saved ? (
          <div className="space-y-3">
            <p>
              Your report is saved on this phone{navigator.onLine ? " and on its way" : " and will be sent when there is signal"}. The answer, or who it went to,
              appears in <strong>More → My help requests</strong>.
            </p>
            <div className="flex gap-2">
              <Link href="/field/more/help" onClick={onClose} className="btn-secondary">
                My help requests
              </Link>
              <button type="button" onClick={onClose} className="btn-ghost">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[var(--text-muted)]">
              Ask how to do something, report something not working in the app, or tell the office something on site is stopping your work.
            </p>

            <div>
              <label htmlFor="help-text" className="block font-semibold mb-1">
                What&apos;s wrong?
              </label>
              <textarea
                id="help-text"
                className="field"
                rows={4}
                value={text}
                maxLength={MAX_DESCRIPTION}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. The Save button does nothing / Water leakage in the basement, cannot start the work"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {mode === "dictate" && (
                  <button type="button" onClick={dictate} className={listeningNow ? "btn-primary" : "btn-secondary"}>
                    <Mic size={18} aria-hidden /> {listeningNow ? "Listening… tap to stop" : "Speak"}
                  </button>
                )}
                {mode === "record" && !voice && (
                  <button type="button" onClick={record} className={recordingSecs !== null ? "btn-primary" : "btn-secondary"}>
                    {recordingSecs !== null ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
                    {recordingSecs !== null ? ` Recording ${recordingSecs}s — tap to stop` : " Record a voice note"}
                  </button>
                )}
                {voice && (
                  <span className="inline-flex items-center gap-2">
                    <audio controls src={voice.url} className="h-10" />
                    <button type="button" onClick={() => setVoice(null)} aria-label="Remove the voice note" className="h-10 w-10 flex items-center justify-center">
                      <Trash2 size={18} />
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="font-semibold mb-1">Screenshot of this screen</p>
              {shot ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
                  <img src={shot.url} alt="Screenshot of the screen you were on" className="w-28 rounded-lg border border-[var(--border)]" />
                  <button type="button" onClick={onRemoveShot} className="btn-ghost btn-sm">
                    Don&apos;t send it
                  </button>
                </div>
              ) : (
                <p className="text-[var(--text-muted)]">No screenshot will be sent.</p>
              )}
            </div>

            <div>
              <p className="font-semibold mb-1">Photos from the site</p>
              <div className="flex flex-wrap gap-2 items-center">
                {photos.map((p, i) => (
                  <span key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
                    <img src={p.url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-[var(--border)]" />
                    <button
                      type="button"
                      onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute -top-2 -right-2 h-7 w-7 rounded-full flex items-center justify-center"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
                {photos.length < MAX_HELP_PHOTOS && (
                  <label className="btn-secondary cursor-pointer">
                    <Camera size={18} aria-hidden /> Take a photo
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void addPhoto(e.target.files)} />
                  </label>
                )}
              </div>
            </div>

            {tasks.length > 0 && (
              <div>
                <label htmlFor="help-task" className="block font-semibold mb-1">
                  Is it about one of your tasks?
                </label>
                <select id="help-task" className="field" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">No / not sure</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · {t.when}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p role="alert" style={{ color: "var(--bad-fg)" }}>
                {error}
              </p>
            )}
            <button type="button" onClick={send} disabled={busy || recordingSecs !== null} className="btn-primary w-full justify-center">
              {busy ? "Saving…" : "Send to the office"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
