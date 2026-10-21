// A payment rating as five stars, with the number in words for screen
// readers. Hook-free, so Server and Client Components share it.

export function StarRating({ stars, size = 14 }: { stars: number | null; size?: number }) {
  if (stars === null) {
    return (
      <span className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
        Not rated yet
      </span>
    );
  }
  return (
    <span role="img" aria-label={`${stars} of 5 stars`} className="inline-flex items-center gap-[1px] leading-none" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden style={{ color: n <= stars ? "var(--warn-fg)" : "var(--border)" }}>
          ★
        </span>
      ))}
    </span>
  );
}
