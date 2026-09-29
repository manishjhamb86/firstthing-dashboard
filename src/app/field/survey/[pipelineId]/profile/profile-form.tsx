"use client";

import { useMemo, useState } from "react";
import { profileGaps } from "@/lib/survey-shell";
import { useOutbox } from "../../../outbox-provider";
import { newItem, saveOnPhone } from "../../../queue";
import { WaitingItem } from "../../../waiting-item";

type Profile = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  manual: boolean;
  rwaMemberCount: number | null;
  nextElectionDate: string;
  gateContactName: string;
  gateContactPhone: string;
  accessHours: string;
  noticeRequired: "" | "none" | "same_day" | "days";
  noticeDays: number | null;
  parkingNotes: string;
  passIdNotes: string;
};
type Member = { id: string; name: string; mobile: string; email: string; position: string; primary: boolean; onPhone?: boolean };

const field = "field min-h-[48px] text-[16px]";

/**
 * SCR-010 on the phone. Everything is saved here first and sent in order.
 * Opened with no signal, the page shows the copy kept on the phone with this
 * phone's own unsent changes laid over it — the latest saved profile, and the
 * members added here — so nothing typed seems to vanish.
 */
export function ProfileForm({
  surveyId,
  label,
  writable,
  state,
  flagReason,
  gaps,
  profile,
  members,
  positions,
}: {
  surveyId: string;
  label: string;
  writable: boolean;
  state: string;
  flagReason: string | null;
  gaps: string[];
  profile: Profile;
  members: Member[];
  positions: { id: string; name: string }[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { surveyId?: string } | null)?.surveyId === surveyId);
  const queuedProfile = [...mine].reverse().find((i) => i.kind === "survey.profile")?.payload as Partial<Profile> | undefined;
  const queuedPrimary = [...mine].reverse().find((i) => i.kind === "survey.primary")?.payload as { memberId: string } | undefined;
  const queuedSection = [...mine].reverse().find((i) => i.kind === "survey.section" && (i.payload as { section: string }).section === "profile")
    ?.payload as { state: string } | undefined;

  const allMembers: Member[] = useMemo(() => {
    const queued = mine
      .filter((i) => i.kind === "survey.member")
      .map((i) => {
        const p = i.payload as { memberId: string; name: string; mobile: string; email: string; positionId: string; primary: boolean };
        return { id: p.memberId, name: p.name, mobile: p.mobile, email: p.email, position: positions.find((x) => x.id === p.positionId)?.name ?? "", primary: p.primary, onPhone: true };
      });
    const list = [...members.filter((m) => !queued.some((q) => q.id === m.id)), ...queued];
    const primaryId = queuedPrimary?.memberId ?? [...queued].reverse().find((q) => q.primary)?.id ?? list.find((m) => m.primary)?.id;
    return list.map((m) => ({ ...m, primary: m.id === primaryId }));
  }, [mine, members, positions, queuedPrimary]);

  const start = { ...profile, ...(queuedProfile ?? {}) } as Profile;
  const [p, setP] = useState<Profile>(start);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setMsg({ tone: "bad", text: "This phone cannot read its location — enter the coordinates by hand." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({ latitude: +pos.coords.latitude.toFixed(5), longitude: +pos.coords.longitude.toFixed(5), accuracyM: Math.round(pos.coords.accuracy), manual: false });
        setMsg(pos.coords.accuracy > 50 ? { tone: "bad", text: `Accurate to about ${Math.round(pos.coords.accuracy)} m — step outside and try again if you can.` } : null);
      },
      () => {
        setLocating(false);
        setMsg({ tone: "bad", text: "Location permission was refused — enter the coordinates by hand." });
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  async function saveProfile(): Promise<boolean> {
    const ok = await saveOnPhone(outbox, [
      newItem(
        "survey.profile",
        {
          surveyId,
          ...p,
          nextElectionDate: p.nextElectionDate || null,
        },
        `Society profile · ${label}`,
      ),
    ]);
    setMsg(ok ? { tone: "ok", text: "Profile saved on this phone — sent to the office by itself." } : { tone: "bad", text: "Could not save on this phone. Try again." });
    return ok;
  }

  // ── a committee member ──
  const [mName, setMName] = useState("");
  const [mMobile, setMMobile] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPos, setMPos] = useState(positions.find((x) => x.name === "Secretary")?.id ?? positions[0]?.id ?? "");
  const [mPrimary, setMPrimary] = useState(allMembers.length === 0);

  async function addMember() {
    const mobile = mMobile.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    if (!mName.trim()) return setMsg({ tone: "bad", text: "Add a name for this member." });
    if (!/^[6-9]\d{9}$/.test(mobile)) return setMsg({ tone: "bad", text: "That's not a 10-digit mobile number." });
    if (allMembers.some((m) => m.mobile.replace(/\D/g, "").endsWith(mobile))) {
      return setMsg({ tone: "bad", text: "Someone on the committee already has this mobile number." });
    }
    const ok = await saveOnPhone(outbox, [
      newItem("survey.member", { surveyId, memberId: crypto.randomUUID(), name: mName.trim(), mobile, email: mEmail.trim(), positionId: mPos, primary: mPrimary }, `Committee: ${mName.trim()} · ${label}`),
    ]);
    if (ok) {
      setMName("");
      setMMobile("");
      setMEmail("");
      setMPrimary(false);
      setMsg({ tone: "ok", text: "Member saved on this phone." });
    }
  }

  async function markPrimary(memberId: string) {
    await saveOnPhone(outbox, [newItem("survey.primary", { surveyId, memberId }, `Primary contact · ${label}`)]);
  }

  // ── the section ──
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const localGaps = profileGaps({
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    currentMembers: allMembers.length,
    primaryContact: allMembers.some((m) => m.primary),
  });

  async function complete() {
    if (localGaps.length > 0) return setMsg({ tone: "bad", text: localGaps.join(" ") });
    if (!(await saveProfile())) return;
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "profile", state: "complete", reason: "" }, `Profile complete · ${label}`)]);
    setMsg({ tone: "ok", text: "Section marked complete — sent after the profile." });
  }
  async function flag() {
    if (!reason.trim()) return setMsg({ tone: "bad", text: "Say why this section is being left incomplete." });
    await saveProfile();
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "profile", state: "flagged", reason }, `Profile flagged · ${label}`)]);
    setFlagging(false);
    setMsg({ tone: "ok", text: "Section flagged — the office sees the reason." });
  }

  const shownState = queuedSection?.state ?? state;
  const dis = !writable;

  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <section>
          <h2 className="lbl mb-2">On this phone · not sent yet</h2>
          <ul className="space-y-2">
            {mine.map((i) => (
              <WaitingItem key={i.seq} item={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Location</h2>
        <button type="button" className="btn-secondary w-full min-h-[48px]" disabled={dis || locating} onClick={useMyLocation}>
          {locating ? "Reading the location…" : "Use my location"}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pf-lat" className="lbl">Latitude</label>
            <input id="pf-lat" inputMode="decimal" className={`${field} num`} disabled={dis} value={p.latitude ?? ""} onChange={(e) => set({ latitude: e.target.value === "" ? null : Number(e.target.value), manual: true, accuracyM: null })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pf-lng" className="lbl">Longitude</label>
            <input id="pf-lng" inputMode="decimal" className={`${field} num`} disabled={dis} value={p.longitude ?? ""} onChange={(e) => set({ longitude: e.target.value === "" ? null : Number(e.target.value), manual: true, accuracyM: null })} />
          </div>
        </div>
        <p className="text-[var(--text-muted)]">
          {p.latitude === null ? "No location yet." : p.manual ? "Entered by hand." : `From this phone, accurate to about ${p.accuracyM ?? "?"} m.`}
        </p>
        <div className="space-y-1.5">
          <label htmlFor="pf-addr" className="lbl">Address</label>
          <textarea id="pf-addr" className={`${field} min-h-[72px]`} disabled={dis} value={p.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Committee</h2>
        <p className="text-[var(--text-muted)]">Offers, reports and invoices go to the primary contact. Record security and the electrician too — they are who a visit actually calls.</p>
        <ul className="space-y-2">
          {allMembers.map((m) => (
            <li key={m.id} className="rounded-[var(--r-md)] border border-[var(--border)] p-3">
              <p className="font-semibold">
                {m.name} <span className="font-normal text-[var(--text-muted)]">· {m.position}</span>
              </p>
              <p className="text-[var(--text-muted)] num">
                {m.mobile}
                {m.email ? ` · ${m.email}` : ""}
                {m.onPhone ? " · on this phone" : ""}
              </p>
              {m.primary ? (
                <p className="font-semibold" style={{ color: "var(--ok-fg)" }}>Primary contact</p>
              ) : (
                !dis && (
                  <button type="button" className="underline min-h-[40px]" onClick={() => void markPrimary(m.id)} aria-label={`Make ${m.name} the primary contact`}>
                    Make primary contact
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        {!dis && (
          <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
            <p className="lbl">Add a member</p>
            <input aria-label="Member name" placeholder="Name" className={field} value={mName} onChange={(e) => setMName(e.target.value)} />
            <input aria-label="Member mobile" placeholder="Mobile" inputMode="tel" className={`${field} num`} value={mMobile} onChange={(e) => setMMobile(e.target.value)} />
            <input aria-label="Member email" placeholder="Email (optional)" inputMode="email" className={field} value={mEmail} onChange={(e) => setMEmail(e.target.value)} />
            <select aria-label="Member position" className={field} value={mPos} onChange={(e) => setMPos(e.target.value)}>
              {positions.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 min-h-[44px]">
              <input type="checkbox" className="h-5 w-5" checked={mPrimary} onChange={(e) => setMPrimary(e.target.checked)} />
              Primary contact
            </label>
            <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void addMember()}>
              Add member
            </button>
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Governance</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pf-rwa" className="lbl">RWA members</label>
            <input id="pf-rwa" inputMode="numeric" className={`${field} num`} disabled={dis} value={p.rwaMemberCount ?? ""} onChange={(e) => set({ rwaMemberCount: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pf-elec" className="lbl">Next election</label>
            <input id="pf-elec" type="date" className={field} disabled={dis} value={p.nextElectionDate} onChange={(e) => set({ nextElectionDate: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Access & entry</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pf-gn" className="lbl">Gate contact</label>
            <input id="pf-gn" className={field} disabled={dis} value={p.gateContactName} onChange={(e) => set({ gateContactName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pf-gp" className="lbl">Their mobile</label>
            <input id="pf-gp" inputMode="tel" className={`${field} num`} disabled={dis} value={p.gateContactPhone} onChange={(e) => set({ gateContactPhone: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pf-hours" className="lbl">Access hours</label>
          <input id="pf-hours" className={field} disabled={dis} value={p.accessHours} placeholder="e.g. 6am–10pm" onChange={(e) => set({ accessHours: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pf-notice" className="lbl">Notice before a visit</label>
            <select id="pf-notice" className={field} disabled={dis} value={p.noticeRequired} onChange={(e) => set({ noticeRequired: e.target.value as Profile["noticeRequired"] })}>
              <option value="">Not asked</option>
              <option value="none">Not required</option>
              <option value="same_day">Same day</option>
              <option value="days">Days ahead</option>
            </select>
          </div>
          {p.noticeRequired === "days" && (
            <div className="space-y-1.5">
              <label htmlFor="pf-nd" className="lbl">How many days</label>
              <input id="pf-nd" inputMode="numeric" className={`${field} num`} disabled={dis} value={p.noticeDays ?? ""} onChange={(e) => set({ noticeDays: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pf-park" className="lbl">Parking</label>
          <input id="pf-park" className={field} disabled={dis} value={p.parkingNotes} onChange={(e) => set({ parkingNotes: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pf-pass" className="lbl">Pass or ID needed</label>
          <input id="pf-pass" className={field} disabled={dis} value={p.passIdNotes} onChange={(e) => set({ passIdNotes: e.target.value })} />
        </div>
        {!dis && (
          <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void saveProfile()}>
            Save the profile
          </button>
        )}
      </section>

      {!dis && (
        <section className="card p-4 space-y-3">
          <p>
            Section: <span className="font-semibold">{shownState.replace("_", " ")}</span>
            {shownState === "flagged" && flagReason ? ` — ${flagReason}` : ""}
          </p>
          {localGaps.length > 0 ? (
            <ul className="list-disc pl-5" style={{ color: "var(--warn-fg)" }}>
              {localGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : gaps.length > 0 && shownState !== "complete" ? (
            <p className="text-[var(--text-muted)]">Ready to complete on this phone; the office checks again when it arrives.</p>
          ) : null}
          <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void complete()}>
            Complete this section
          </button>
          {flagging ? (
            <div className="space-y-2">
              <label htmlFor="pf-flag" className="lbl">Why is it incomplete?</label>
              <input id="pf-flag" className={field} value={reason} placeholder="e.g. committee list not available today" onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void flag()}>
                Flag the section
              </button>
            </div>
          ) : (
            <button type="button" className="underline min-h-[44px]" onClick={() => setFlagging(true)}>
              Leave it incomplete, with a reason
            </button>
          )}
        </section>
      )}

      {msg && (
        <p role={msg.tone === "bad" ? "alert" : "status"} className="card p-3" style={msg.tone === "ok" ? { background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" } : { background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
