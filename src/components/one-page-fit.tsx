"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a letterhead document on ONE printed page (2026-09-27, the user's
 * rule: "the savings report will always be a single page report unless
 * approved to be more than that").
 *
 * Layout alone cannot promise it: a report's height depends on its data — a
 * kept-lights note, a second circuit, a longer demo — and a block that must
 * not split jumps whole to page 2 the moment it does not fit. So when the page
 * is laid out for print, this measures the letterhead and, if it is taller
 * than one A4 sheet, scales it down to fit. A report that fits is untouched.
 *
 * It measures only while print media is active (the matchMedia listener, and
 * beforeprint when print already matches): measuring the screen layout would
 * scale by the wrong height.
 */

// A4 is 210 × 297mm = 794 × 1123px at 96dpi. The letterhead page has no
// margin in Chrome (794 × 1123); Safari keeps ~12.7mm on every side
// (698 × 1027). The sheet must fit BOTH: text wraps more at 698, while
// full-width charts grow taller at 794. A little under each height is left
// for rounding.
const PAGES = [
  { width: 698, height: 1015 },
  { width: 794, height: 1110 },
];

/**
 * The height the sheet prints at, scaled by `zoom`, on a page `width` wide.
 * Under zoom the content lays out at width/zoom CSS pixels — wider, so
 * width-proportional content (the charts) grows as the scale drops — which is
 * why one measurement is not enough and the fit below iterates.
 */
function printedHeight(sheet: HTMLElement, zoom: number, width: number) {
  sheet.style.setProperty("zoom", String(zoom));
  sheet.style.setProperty("width", `${width / zoom}px`);
  return sheet.getBoundingClientRect().height;
}

export function OnePageFit() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sheet = marker.current?.closest(".letterhead") as HTMLElement | null;
    if (!sheet) return;
    const mq = window.matchMedia("print");

    const reset = () => {
      sheet.style.removeProperty("zoom");
    };
    const fit = () => {
      if (!mq.matches) return;
      reset();
      let zoom = 1;
      for (let i = 0; i < 10; i++) {
        // The tightest page decides: its printed height over its room.
        const over = Math.max(...PAGES.map((p) => printedHeight(sheet, zoom, p.width) / p.height));
        if (over <= 1) break;
        zoom = Math.floor((zoom / over) * 0.98 * 1000) / 1000;
      }
      sheet.style.removeProperty("width");
      if (zoom >= 1) reset();
      else sheet.style.setProperty("zoom", String(zoom));
    };
    const onChange = (e: MediaQueryListEvent) => (e.matches ? fit() : reset());

    mq.addEventListener("change", onChange);
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
    };
  }, []);

  return <span ref={marker} hidden />;
}
