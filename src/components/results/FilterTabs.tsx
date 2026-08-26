"use client";

import { cn } from "@/lib/utils";
import type { FilterKey } from "@/lib/view-model";

const TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "answered", label: "Answered" },
  { key: "unanswered", label: "Unanswered" },
  { key: "review", label: "Needs review" },
];

export function FilterTabs({
  value,
  counts,
  onChange,
}: {
  value: FilterKey;
  counts: Record<FilterKey, number>;
  onChange: (key: FilterKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter questions"
      className="flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1"
    >
      {TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
              active ? "bg-ink text-white" : "text-ink-soft hover:bg-panel",
            )}
          >
            {tab.label}
            <span className={cn("ml-1.5 tabular-nums", active ? "text-white/70" : "text-muted")}>
              {counts[tab.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
