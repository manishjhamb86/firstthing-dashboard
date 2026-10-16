"use client";

import { useEffect, useState } from "react";
import styles from "./marketing.module.css";

/**
 * The nav's mobile toggle, plus smooth anchor scrolling — the one thing the
 * original plain HTML got from a bare `html{scroll-behavior:smooth}` rule.
 * That can't be scoped to this page the way every other rule here is (html
 * is the document root, not a descendant of anything this component
 * renders), so it's set on the real document element for as long as this
 * page is mounted and put back the way it was on the way out, rather than
 * leaving every other route in the app smooth-scrolling too.
 */
export function MobileNav({ loggedIn, dashboardHref }: { loggedIn: boolean; dashboardHref: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  return (
    <>
      <nav className={`${styles.navlinks} ${open ? styles.open : ""}`} id="navlinks">
        <a href="#solutions" onClick={() => setOpen(false)}>
          Solutions
        </a>
        <a href="#process" onClick={() => setOpen(false)}>
          How It Works
        </a>
        <a href="#impact" onClick={() => setOpen(false)}>
          Our Impact
        </a>
        <a href="#industries" onClick={() => setOpen(false)}>
          Industries
        </a>
        <a href={loggedIn ? dashboardHref : "/login"} onClick={() => setOpen(false)}>
          {loggedIn ? "Dashboard" : "Customer Login"}
        </a>
        <a className={styles.btn} href="#contact" onClick={() => setOpen(false)}>
          Get Free Assessment ↗
        </a>
      </nav>
      <button
        type="button"
        className={styles.mobileMenu}
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
    </>
  );
}
