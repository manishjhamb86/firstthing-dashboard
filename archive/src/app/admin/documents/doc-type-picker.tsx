"use client";

import { TONE_VARS } from "@/components/shell/StatusChip";
import { DOC_TYPE_LABEL, DOC_TYPE_ICON, DOC_TYPE_TONE, DOC_TYPE_DESC, COMING_SOON, type DocType } from "./doc-type-meta";

export default function DocTypePicker({ value, onChange }: { value: DocType; onChange: (type: DocType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((key) => {
        const Icon = DOC_TYPE_ICON[key];
        const tone = TONE_VARS[DOC_TYPE_TONE[key]];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-start gap-2 rounded-[14px] border p-3.5 text-left transition-all"
            style={{
              borderColor: active ? tone.fg : "var(--bd)",
              background: active ? tone.bg : "var(--card)",
              boxShadow: active ? `0 0 0 1.5px ${tone.fg}` : "none",
            }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: active ? tone.fg : tone.bg, color: active ? "var(--onac)" : tone.fg }}
            >
              <Icon size={17} strokeWidth={2} />
            </div>
            <div>
              <div className="text-xs font-bold text-ink">{DOC_TYPE_LABEL[key]}</div>
              <div className="text-[10.5px] leading-snug text-m2">{DOC_TYPE_DESC[key]}</div>
            </div>
          </button>
        );
      })}

      {COMING_SOON.map((c) => (
        <div
          key={c.value}
          className="relative flex cursor-not-allowed flex-col items-start gap-2 rounded-[14px] border border-border bg-card-2 p-3.5 text-left opacity-60"
        >
          <span className="absolute right-2 top-2 rounded-full bg-card3 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-m2" style={{ background: "var(--card3)" }}>
            Soon
          </span>
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: "var(--card3)", color: "var(--m2)" }}>
            <c.icon size={17} strokeWidth={2} />
          </div>
          <div>
            <div className="text-xs font-bold text-ink">{c.label}</div>
            <div className="text-[10.5px] leading-snug text-m2">{c.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
