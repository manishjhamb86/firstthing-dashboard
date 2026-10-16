"use client";

import { useState, useTransition } from "react";
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
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await submitMarketingEnquiry({ name, organisation, mobile, interest });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSent(true);
      setName("");
      setOrganisation("");
      setMobile("");
      setInterest(MARKETING_INTERESTS[0]);
    });
  }

  return (
    <form className={styles.leadform} onSubmit={submit}>
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
      {sent && (
        <p className={styles.notice} style={{ display: "block", marginTop: 8 }}>
          Thanks — your request has been received.
        </p>
      )}
    </form>
  );
}
