// Approved FT wordmark (docs/product/brand/README.md — "The Reading", picked
// after 05a-theme-system.md §3.11's contrast pass). Used wherever a page
// needs the brand identity, not just the browser-tab favicon (icon.svg) —
// the two were previously out of sync, favicon wired in at MS-01 but the
// mark never actually appeared inside the product itself.
//
// Two variants matching the two lockup SVGs the brand doc actually ships:
// "light" (dark text) for light/Slate-content working surfaces, "dark"
// (light text) for the dark chrome tokens (§3.2b's --chrome). The icon tile
// itself already contrasts on both — only the wordmark text colour changes.
export function BrandMark({
  className,
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed
    <img
      src={`/brand/wordmark-lockup-${variant}.svg`}
      alt="FirsThing"
      className={className ?? "h-8"}
    />
  );
}
