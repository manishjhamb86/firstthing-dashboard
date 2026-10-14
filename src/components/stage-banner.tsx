/**
 * A persistent, un-dismissible marker that this is the STAGING deployment,
 * not the live site (2026-10-14, user-asked): "hard to ignore... no matter
 * on what page he is on" — real changes had been made to the wrong one,
 * both directions, because the two looked identical in a browser.
 *
 * Rendered from the root layout, so it wraps every surface this app has
 * (/admin, /portal, /field, /login, /marketing) with no per-shell wiring.
 * Deliberately no close button: a banner someone dismisses once is exactly
 * the thing that stops helping a week later.
 */
export function StageBanner() {
  return (
    <div className="stage-banner no-print" role="status" aria-label="Staging environment — not the live site">
      <div className="stage-banner__bar">⚠ STAGING — changes here are NOT live</div>
      <div className="stage-banner__stripe" aria-hidden="true" />
    </div>
  );
}
