import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";

/**
 * The company letterhead every system-generated document wears (2026-09-25,
 * user-asked, with the investor term sheet as the example): logo top-left,
 * the brand and legal name top-right, and the contact line as the footer —
 * on screen as a sheet, and on EVERY printed page.
 *
 * Print mechanics, because each one is load-bearing:
 * - `@page { margin: 0 }` (globals.css) is what stops the browser printing its
 *   own header and footer — the date, the page title and the URL. Browsers
 *   draw those in the page margin, so with no margin there is nowhere to put them.
 * - The page margin is therefore rebuilt inside the document: the head and
 *   foot are `position: fixed`, which the browser repeats on every printed
 *   page, and the frame's <thead>/<tfoot> spacers (repeated per page by the
 *   table model) keep the content from running underneath them.
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
      {head}
      <table className="lh-frame">
        <thead aria-hidden>
          <tr>
            <td>
              <div className="lh-space-top" />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="lh-body">{children}</td>
          </tr>
        </tbody>
        <tfoot aria-hidden>
          <tr>
            <td>
              <div className="lh-space-bottom" />
            </td>
          </tr>
        </tfoot>
      </table>
      {foot}
    </div>
  );
}
