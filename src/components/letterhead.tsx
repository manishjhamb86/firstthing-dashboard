import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";

/**
 * The company letterhead every system-generated document wears (2026-09-25,
 * user-asked, with the investor term sheet as the example): logo top-left,
 * the brand and legal name top-right, and the contact line as the footer —
 * on screen as a sheet, and on EVERY printed page.
 *
 * Print mechanics, because each one is load-bearing:
 * - `@page letterhead { margin: 0 }` (globals.css) is what stops Chrome
 *   printing its own date, title and URL — it draws them in the page margin,
 *   so with no margin there is nowhere to put them.
 * - The head and foot are the frame table's <thead>/<tfoot>, IN FLOW. A
 *   `position: fixed` head/foot was tried first (2026-09-25) and Safari does
 *   not repeat fixed elements on paper — the footer landed on a page of its
 *   own (user-reported). A table header repeats on every page in Chrome and
 *   Safari alike; Chrome repeats the footer too, Safari prints it once after
 *   the content. Either way a one-page report is one page.
 */
export function Letterhead({ children }: { children: ReactNode }) {
  const head = (
    <div className="lh-head">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/brand/wordmark-lockup-light.svg" alt="FirsThing" className="lh-logo" />
      <div className="lh-id">
        <p className="lh-brand">{COMPANY.brand}</p>
        <p>{COMPANY.legalName}</p>
        {COMPANY.address && <p>{COMPANY.address}</p>}
        {COMPANY.gstin && <p>GSTIN {COMPANY.gstin}</p>}
      </div>
    </div>
  );
  const foot = (
    <div className="lh-foot">
      <p className="lh-foot-line">{[COMPANY.brand, COMPANY.legalName, COMPANY.website, COMPANY.email].join(" | ")}</p>
      {COMPANY.footnote && <p className="lh-foot-note">{COMPANY.footnote}</p>}
    </div>
  );
  return (
    <div className="letterhead">
      <table className="lh-frame">
        <thead>
          <tr>
            <td>{head}</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="lh-body">{children}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>{foot}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
