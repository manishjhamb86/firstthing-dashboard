"use client";

import { useState } from "react";
import { SearchSelect } from "@/components/search-select";
import { FmCompanyButton } from "@/app/admin/facility-management/company-form";

/**
 * Pick a facility management company by typing, or add one on the spot when
 * it is not on the list yet (2026-09-25). Commits the company's id.
 */
export function FmCompanyPicker({
  id,
  companies,
  value,
  onChange,
}: {
  id?: string;
  companies: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [extra, setExtra] = useState<{ id: string; name: string }[]>([]);
  const all = [...companies, ...extra.filter((e) => !companies.some((c) => c.id === e.id))];
  return (
    <div className="space-y-1">
      <SearchSelect
        id={id}
        options={all.map((c) => ({ id: c.id, label: c.name }))}
        value={value}
        onCommit={onChange}
        placeholder="Type the company's name"
        emptyLabel="Not on the list — add it below"
      />
      <FmCompanyButton
        className="text-[12.5px] font-semibold"
        label="+ Add a new company"
        onCreated={(c) => {
          setExtra((x) => [...x, c]);
          onChange(c.id);
        }}
      />
    </div>
  );
}
