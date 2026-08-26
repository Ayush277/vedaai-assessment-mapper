"use client";

import { ChevronDown, Info, Layers, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { QuestionRow } from "@/lib/view-model";
import { confidenceLabel } from "@/lib/view-model";
import { StatusPill } from "./StatusPill";

export function QuestionCard({
  row,
  index,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
}: {
  row: QuestionRow;
  index: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const { question, mapping, answer, grade, pages, isMultiPage } = row;
  const scoreTone =
    grade === undefined
      ? "neutral"
      : grade.marksObtained === 0
        ? "danger"
        : grade.marksObtained >= grade.maxMarks
          ? "success"
          : "warn";

  return (
    <li>
      <div
        className={cn(
          "rounded-card border bg-surface transition-colors",
          selected
            ? "border-brand shadow-[0_0_0_1px_var(--color-brand)]"
            : "border-line hover:border-line-strong",
        )}
      >
        <div className="flex items-start gap-3 p-3">
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors",
                selected ? "bg-brand text-white" : "bg-panel text-ink",
              )}
            >
              {index + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-bold text-ink">
                  {question.label.replace(/[.:]$/, "")}
                </span>
                {question.section ? (
                  <Badge tone="neutral" className="px-1.5">
                    {question.section}
                  </Badge>
                ) : null}
                {typeof question.marks === "number" ? (
                  <Badge tone="neutral" className="px-1.5">
                    {question.marks} {question.marks === 1 ? "mark" : "marks"}
                  </Badge>
                ) : null}
                {isMultiPage ? (
                  <Badge tone="brand" className="px-1.5">
                    <Layers className="size-3" strokeWidth={2.5} />
                    Pages {pages.join(", ")}
                  </Badge>
                ) : null}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">
                {question.text}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill status={mapping.status} />
                {mapping.status === "needs_review" ? (
                  <span className="text-[11px] font-medium text-muted">
                    {confidenceLabel(mapping.confidence)} confident
                  </span>
                ) : null}
              </span>
            </span>
          </button>

          <span className="flex shrink-0 items-center gap-1.5">
            {grade ? (
              <Badge tone={scoreTone}>
                {grade.marksObtained}/{grade.maxMarks}
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide details" : "Show details"}
              className="grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
            >
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
              />
            </button>
          </span>
        </div>

        {expanded ? (
          <div className="space-y-2.5 border-t border-line px-3 pt-3 pb-3">
            {answer ? (
              <div className="rounded-xl bg-panel p-3">
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Student&apos;s answer
                  {answer.recognizedLabel ? ` · written as "${answer.recognizedLabel}"` : ""}
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
                  {answer.text || "The handwriting in this region could not be read."}
                </p>
                {answer.appearsIncomplete ? (
                  <p className="mt-2 text-[11px] font-medium text-warn">
                    This answer runs to the bottom of the page and may be incomplete.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong bg-panel/60 p-3">
                <p className="text-[13px] font-semibold text-ink">No answer found</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  This question appears to be unanswered.
                </p>
              </div>
            )}

            {grade?.feedback ? (
              <div className="rounded-xl border border-brand/20 bg-brand-soft/50 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-ink">
                  <Sparkles className="size-3.5 text-brand" />
                  AI Feedback
                </p>
                <p className="text-[12px] leading-relaxed text-ink-soft">
                  {grade.feedback}
                </p>
                {grade.requiresReview ? (
                  <p className="mt-1.5 text-[11px] font-medium text-warn">
                    Low confidence — please verify this evaluation.
                  </p>
                ) : null}
              </div>
            ) : null}

            {mapping.reasons.length > 0 ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-muted hover:text-ink">
                  <Info className="size-3.5" />
                  How this was matched
                </summary>
                <ul className="mt-1.5 space-y-1 pl-5 text-[11px] leading-relaxed text-muted">
                  {mapping.reasons.map((reason) => (
                    <li key={reason} className="list-disc">
                      {reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
