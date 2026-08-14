// Approved FT wordmark (docs/product/brand/README.md — "The Reading", picked
// after 05a-theme-system.md §3.11's contrast pass). Used wherever a page
// needs the brand identity, not just the browser-tab favicon (icon.svg) —
// the two were previously out of sync, favicon wired in at MS-01 but the
// mark never actually appeared inside the product itself.
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed
    <img src="/brand/wordmark-lockup-light.svg" alt="FirsThing" className={className ?? "h-8"} />
  );
}
