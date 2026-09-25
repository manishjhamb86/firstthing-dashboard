"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip } from "@/components/ui";
import { codeFromScan } from "@/lib/inventory";
import { MoveUnitsForm, type MoveContext } from "../move-forms";
import { lookupScanned } from "../actions";

type Mode = "open" | "collect";
type Row = { code: string; found?: boolean; item?: string; status?: string; location?: string | null };

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

const STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  deployed: "Deployed",
  faulty: "Faulty",
  returned_to_supplier: "Returned to supplier",
  scrapped: "Scrapped",
  lost: "Lost",
};

/**
 * The camera loop. The browser's own barcode reader where there is one
 * (Chrome on Android); otherwise jsQR, loaded only here and only then (iPhone).
 * A code seen again within two seconds is the same sticker still in view, not
 * a second scan.
 */
export function ScanClient({ ctx }: { ctx: MoveContext }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("collect");
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  // Kept here, not in the move form: a successful move empties the list,
  // which unmounts the form and would take its confirmation with it.
  const [moved, setMoved] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lastSeen = useRef<{ code: string; at: number } | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const add = useCallback(
    (raw: string) => {
      const code = codeFromScan(raw);
      if (!code) return;
      const now = Date.now();
      if (lastSeen.current && lastSeen.current.code === code && now - lastSeen.current.at < 2000) return;
      lastSeen.current = { code, at: now };
      navigator.vibrate?.(60);
      if (modeRef.current === "open") {
        router.push(`/admin/inventory?code=${encodeURIComponent(code)}`);
        return;
      }
      setFlash(code);
      setMoved(null);
      setRows((r) => (r.some((x) => x.code === code) ? r : [{ code }, ...r]));
      startTransition(async () => {
        const [info] = await lookupScanned([code]);
        if (info) setRows((r) => r.map((x) => (x.code === code ? { ...x, ...info } : x)));
      });
    },
    [router],
  );

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setError("The camera could not be opened. Allow camera access for this site, or type the code below.");
        setOn(false);
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Native) {
        try {
          detector = new Native({ formats: ["qr_code", "code_128"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const tick = async () => {
        if (stopped) return;
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              for (const b of await detector.detect(v)) add(b.rawValue);
            } else if (jsQR) {
              const c = canvas.current!;
              const w = Math.min(v.videoWidth, 800);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              c.width = w;
              c.height = h;
              const g = c.getContext("2d", { willReadFrequently: true })!;
              g.drawImage(v, 0, 0, w, h);
              const found = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
              if (found?.data) add(found.data);
            }
          } catch {
            /* a frame that fails to decode is just a frame; keep going */
          }
        }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, add]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  const movable = rows.filter((r) => r.found).map((r) => r.code);
  const chip = (active: boolean) => (active ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" } : undefined);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className="chip" style={chip(mode === "collect")} onClick={() => setMode("collect")}>
            Collect for a move
          </button>
          <button type="button" className="chip" style={chip(mode === "open")} onClick={() => setMode("open")}>
            Open each unit
          </button>
          <div className="ml-auto">
            <button type="button" className={on ? "btn-secondary btn-sm" : "btn-primary btn-sm"} onClick={() => { setError(null); setOn((x) => !x); }}>
              {on ? "Stop camera" : "Start camera"}
            </button>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg" style={{ background: "#000", aspectRatio: "4 / 3" }}>
          <video ref={video} playsInline muted className="h-full w-full object-cover" style={{ display: on ? "block" : "none" }} />
          {!on && <p className="absolute inset-0 grid place-items-center p-6 text-center text-[13px]" style={{ color: "#ddd" }}>Camera is off. Start it and hold a label inside the frame.</p>}
          {on && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2" style={{ borderColor: "rgba(255,255,255,.8)" }} />}
          {flash && <p className="absolute inset-x-0 bottom-3 mx-auto w-max rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>✓ {flash}</p>}
        </div>
        <canvas ref={canvas} className="hidden" />
        {error && <ErrorText>{error}</ErrorText>}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) add(typed);
            setTyped("");
          }}
        >
          <input className="field" placeholder="Or type / USB-scan a code" aria-label="Code" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className="btn-secondary btn-sm">Add</button>
        </form>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-bold">Scanned · {rows.length}</p>
          {rows.length > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRows([])}>
              Clear
            </button>
          )}
        </div>
        {moved && (
          <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ok-fg)" }}>
            {moved}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Scanned labels collect here. Record one move for all of them below.</p>
        ) : (
          <ul className="mb-4 max-h-[320px] divide-y overflow-y-auto" style={{ borderColor: "var(--border-subtle)" }}>
            {rows.map((r) => (
              <li key={r.code} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <span className="num font-semibold">{r.code}</span>
                {r.found === undefined ? (
                  <span style={{ color: "var(--text-subtle)" }}>Looking up…</span>
                ) : r.found ? (
                  <>
                    <span>{r.item}</span>
                    <StatusChip tone={r.status === "in_stock" ? "ok" : r.status === "faulty" ? "bad" : "neu"}>{STATUS_LABEL[r.status ?? ""] ?? r.status}</StatusChip>
                    {r.location && <span style={{ color: "var(--text-subtle)" }}>{r.location}</span>}
                  </>
                ) : (
                  <StatusChip tone="bad">Not one of ours</StatusChip>
                )}
                <button type="button" className="ml-auto text-[12px]" style={{ color: "var(--text-subtle)" }} onClick={() => setRows((x) => x.filter((y) => y.code !== r.code))} aria-label={`Remove ${r.code}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {movable.length > 0 && (
          <MoveUnitsForm
            codes={movable}
            ctx={ctx}
            onDone={(r) => {
              setMoved(`${r.done} recorded.${r.failed.length ? ` ${r.failed.length} could not be moved — they are still in the list.` : ""}`);
              const failed = new Set(r.failed.map((f) => f.code));
              setRows((x) => x.filter((y) => failed.has(y.code) || !y.found));
            }}
          />
        )}
      </Card>
    </div>
  );
}
