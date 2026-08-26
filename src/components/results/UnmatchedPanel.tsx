"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Answer } from "@/lib/types/assessment";

export function UnmatchedPanel({
  answers,
  selectedId,
  onSelect,
}: {
  answers: Answer[];
  selectedId: string | null;
  onSelect: (answerId: string) => void;
}) {
  if (answers.length === 0) return null;

  return (
    <section className="rounded-card border border-brand/25 bg-brand-soft/40 p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <HelpCircle className="size-4 text-brand" strokeWidth={2.2} />
        Unmatched answers ({answers.length})
      </h3>
      <p className="mt-0.5 mb-2.5 text-[11px] leading-relaxed text-ink-soft">
        We found handwritten content that could not be confidently linked to a
        question. Select one to see exactly where it was written.
      </p>
      <ul className="space-y-1.5">
        {answers.map((answer) => {
          const pages = [
            ...new Set(answer.regions.map((region) => region.pageNumber)),
          ].sort((a, b) => a - b);
          const selected = selectedId === answer.id;
          return (
            <li key={answer.id}>
              <button
                type="button"
                onClick={() => onSelect(answer.id)}
                aria-pressed={selected}
                className={cn(
                  "w-full rounded-xl border bg-surface p-2.5 text-left transition-colors",
                  selected
                    ? "border-brand shadow-[0_0_0_1px_var(--color-brand)]"
                    : "border-line hover:border-brand/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  {answer.recognizedLabel ? (
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 text-brand">
                      Written as &ldquo;{answer.recognizedLabel}&rdquo;
                    </span>
                  ) : (
                    <span className="rounded bg-panel px-1.5 py-0.5">No label written</span>
                  )}
                  <span>Page {pages.join(", ")}</span>
                </span>
                <span className="mt-1 line-clamp-3 block text-[12px] leading-relaxed text-ink-soft">
                  {answer.text || "This region could not be transcribed."}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
