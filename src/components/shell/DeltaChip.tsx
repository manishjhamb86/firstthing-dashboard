export default function DeltaChip({ value, positive }: { value: string; positive: boolean }) {
  return (
    <span
      className="whitespace-nowrap rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] font-bold"
      style={{
        background: positive ? "var(--okb)" : "var(--bb)",
        color: positive ? "var(--okf)" : "var(--bf)",
      }}
    >
      {value}
    </span>
  );
}
