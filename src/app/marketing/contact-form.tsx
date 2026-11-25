"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import styles from "./marketing.module.css";
import { MARKETING_INTERESTS } from "@/lib/marketing-enquiry";
import { submitMarketingEnquiry } from "./actions";

/**
 * The homepage's lead-capture form (2026-10-16, user-asked: "wire the
 * backend apis for contact us"). Replaces the original's client-side
 * mailto: redirect — "no website backend is connected yet" — with a real
 * submission: submitMarketingEnquiry is the one Server Action in this
 * codebase with no session check, since a visitor filling this in has no
 * account yet by definition.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [mobile, setMobile] = useState("");
  const [interest, setInterest] = useState<string>(MARKETING_INTERESTS[0]);
  const [error, setError] = useState<string | null>(null);
  // What was sent, kept for the thank-you panel (2026-11-25, user-asked: a
  // line of text under the button left it unclear whether anything had gone).
  const [sent, setSent] = useState<{ name: string; organisation: string; mobile: string; interest: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const thanksRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) thanksRef.current?.focus();
  }, [sent]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await submitMarketingEnquiry({ name, organisation, mobile, interest });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSent({ name: name.trim(), organisation: organisation.trim(), mobile: mobile.trim(), interest });
      setName("");
      setOrganisation("");
      setMobile("");
      setInterest(MARKETING_INTERESTS[0]);
    });
  }

  if (sent) {
    const first = sent.name.split(/\s+/)[0] ?? "";
    return (
      <div className={styles.leadform} role="status" aria-live="polite" style={{ textAlign: "center" }}>
        <div
          aria-hidden
          style={{ width: 64, height: 64, margin: "8px auto 18px", borderRadius: "50%", background: "#e8f5ee", color: "#1f7a4c", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 700 }}
        >
          ✓
        </div>
        <h3 ref={thanksRef} tabIndex={-1} style={{ outline: "none" }}>
          Thank you{first ? `, ${first}` : ""}!
        </h3>
        <p style={{ margin: "10px 0 6px", lineHeight: 1.6 }}>
          Your request for <strong>{sent.interest}</strong>
          {sent.organisation ? (
            <>
              {" "}
              at <strong>{sent.organisation}</strong>
            </>
          ) : null}{" "}
          has been received.
        </p>
        <p className={styles.disclaimer} style={{ marginBottom: 22 }}>
          Our team will call you on {sent.mobile}, usually within one business day.
        </p>
        <button className={styles.btn} type="button" onClick={() => setSent(null)}>
          Request another assessment
        </button>
      </div>
    );
  }

  return (
    <form className={styles.leadform} onSubmit={submit} aria-busy={pending} style={{ position: "relative" }}>
      {/* On submit the form goes behind a spinner first (2026-11-25,
          user-asked), then the thank-you panel replaces it — never a quiet
          line of text under a button that may or may not have done anything. */}
      {pending && (
        <div className={styles.formBusy} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden />
          <span>Sending your request…</span>
        </div>
      )}
      <h3>Request an Assessment</h3>
      <label htmlFor="name">Your name</label>
      <input id="name" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="society">Society / Organisation</label>
      <input
        id="society"
        required
        placeholder="Society / Organisation"
        value={organisation}
        onChange={(e) => setOrganisation(e.target.value)}
      />
      <label htmlFor="phone">Phone number</label>
      <input
        id="phone"
        required
        type="tel"
        placeholder="Phone number"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
      />
      <label htmlFor="need">Interested in</label>
      <select id="need" value={interest} onChange={(e) => setInterest(e.target.value)}>
        {MARKETING_INTERESTS.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <button className={styles.btn} type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request an Assessment ↗"}
      </button>
      {error && (
        <p style={{ marginTop: 12, color: "#b3261e", fontSize: "0.9rem", fontWeight: 600 }}>{error}</p>
      )}
      <p className={styles.disclaimer} style={{ marginTop: 12 }}>
        We&apos;ll get in touch using the details above, usually within one business day.
      </p>
    </form>
  );
}
