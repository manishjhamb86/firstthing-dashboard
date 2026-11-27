"use client";

import { useState } from "react";
import styles from "./community.module.css";

/**
 * Share and print on a society's public page. Share uses the phone's own
 * share sheet where there is one, else copies the link and says so on the
 * page (never an alert). Print prints the certificate alone — the page's
 * print rules hide everything else.
 */
export function ShareButton({ name, className }: { name: string; className: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const data = { title: `${name} | FirsThing Featured Community`, text: `Discover ${name} — a FirsThing Featured Community.`, url: window.location.href };
    if (navigator.share) {
      await navigator.share(data).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  }
  return (
    <>
      <button type="button" className={className} onClick={() => void share()}>
        Share this page ↗
      </button>
      {copied && (
        <span className={styles.copied} role="status">
          Link copied
        </span>
      )}
    </>
  );
}

export function PrintButton({ className }: { className: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      Print / save certificate
    </button>
  );
}
