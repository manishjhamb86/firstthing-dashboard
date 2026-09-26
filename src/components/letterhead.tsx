import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";
import { OnePageFit } from "@/components/one-page-fit";

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
/**
 * ONE PAGE IS THE RULE (2026-09-27, user's rule). Every letterhead document
 * prints on a single A4 page — OnePageFit scales it down if its data makes it
 * taller. A document may run to more pages only when approved: pass
 * `multiPage` with the reason in a comment beside it, where a reviewer sees it.
 */
export function Letterhead({ children, multiPage = false }: { children: ReactNode; multiPage?: boolean }) {
  const head = (
    <div className="lh-head">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/brand/wordmark-lockup-light.svg" alt="FirsThing" className="lh-logo" />
      <div className="lh-id">
        <p className="lh-brand">{COMPANY.brand}</p>
        <p>{COMPANY.legalName}</p>
        {COMPANY.gstin && <p>GSTIN {COMPANY.gstin}</p>}
      </div>
    </div>
  );
  const foot = (
    <div className="lh-foot">
      <p className="lh-foot-line">{[COMPANY.brand, COMPANY.legalName, COMPANY.website, COMPANY.email].join(" | ")}</p>
      {/* On the footer's second line rather than under the name at the head:
          a long line there wraps and costs every page its height. */}
      {COMPANY.address && <p className="lh-foot-address">{COMPANY.address}</p>}
      {COMPANY.footnote && <p className="lh-foot-note">{COMPANY.footnote}</p>}
    </div>
  );
  return (
    <div className="letterhead">
      {!multiPage && <OnePageFit />}
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
