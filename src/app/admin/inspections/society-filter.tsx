"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";

/** Filters the inspections listing by society (2026-10-06, user-asked) — a typeahead, not a 19-row `<select>`, matching this app's own established convention for a society picker. */
export function InspectionSocietyFilter({ options }: { options: SearchSelectOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("societyId");

  function go(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("societyId", id);
    else params.delete("societyId");
    router.push(`/admin/inspections${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <label className="text-xs text-[var(--text-muted)]">
        <span className="mb-1 block">Society</span>
        <div className="w-72 max-w-full">
          <SearchSelect options={options} value={value} placeholder="All societies" onCommit={go} />
        </div>
      </label>
      {value && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => go(null)}>
          Show all
        </button>
      )}
    </div>
  );
}
