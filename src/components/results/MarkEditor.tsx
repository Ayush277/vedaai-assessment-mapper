"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewEdit } from "@/lib/types/assessment";
import type { QuestionRow } from "@/lib/view-model";

/**
 * Teacher control over one question's evaluation.
 *
 * The AI's grade is never overwritten — an edit is stored beside it — so
 * "Revert" can always put the original back, and the report can say how much of
 * the score is the teacher's. Changes apply as they are made rather than behind
 * a Save button, because a teacher moving through a class should not have to
 * remember to commit each question.
 */
export function MarkEditor({
  row,
  edit,
  onChange,
  onRevert,
}: {
  row: QuestionRow;
  edit?: ReviewEdit;
  onChange: (next: ReviewEdit) => void;
  onRevert: () => void;
}) {
  const maxMarks = row.grade?.maxMarks ?? row.question.marks ?? 1;
  const marks = row.grade?.marksObtained ?? 0;
  const [feedback, setFeedback] = useState(row.grade?.feedback ?? "");
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the row when the teacher switches student or question.
  useEffect(() => {
    setFeedback(row.grade?.feedback ?? "");
  }, [row.question.id, row.grade?.feedback]);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const flashSaved = () => {
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1400);
  };

  const setMarks = (value: number) => {
    const clamped = Math.min(maxMarks, Math.max(0, value));
    if (clamped === marks) return;
    onChange({ ...edit, marksObtained: clamped });
    flashSaved();
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
          Teacher review
        </span>

        {row.isEdited ? (
          <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">
            Edited
          </span>
        ) : null}

        <span
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium text-success-ink transition-opacity duration-200",
            justSaved ? "opacity-100" : "opacity-0",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
          Saved
        </span>

        {row.isEdited ? (
          <button
            type="button"
            onClick={() => {
              onRevert();
              setFeedback(row.originalGrade?.feedback ?? "");
              flashSaved();
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-panel"
          >
            <RotateCcw className="size-3" />
            Revert to AI
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMarks(marks - 1)}
            disabled={marks <= 0}
            aria-label="Decrease marks"
            className="grid size-7 place-items-center rounded-full border border-line text-ink-soft transition-transform hover:bg-panel active:scale-90 disabled:text-line-strong"
          >
            <Minus className="size-3.5" />
          </button>

          <label className="flex items-baseline gap-1 px-1">
            <span className="sr-only">Marks awarded</span>
            <input
              type="number"
              min={0}
              max={maxMarks}
              value={marks}
              onChange={(event) => setMarks(Number(event.target.value))}
              className={cn(
                "w-11 rounded-lg border border-line bg-surface px-1.5 py-0.5 text-center",
                "text-[15px] font-bold text-ink tabular-nums transition-colors",
                row.isEdited && "border-brand/40 bg-brand-soft/40",
              )}
            />
            <span className="text-[12px] font-semibold text-muted tabular-nums">
              / {maxMarks}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setMarks(marks + 1)}
            disabled={marks >= maxMarks}
            aria-label="Increase marks"
            className="grid size-7 place-items-center rounded-full border border-line text-ink-soft transition-transform hover:bg-panel active:scale-90 disabled:text-line-strong"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {[0, Math.round(maxMarks / 2), maxMarks]
            .filter((value, index, all) => all.indexOf(value) === index)
            .map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMarks(value)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  marks === value
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line text-ink-soft hover:bg-panel",
                )}
              >
                {value}
              </button>
            ))}
        </div>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Feedback for this question</span>
        <textarea
          value={feedback}
          rows={2}
          placeholder="Add or adjust the feedback the student will see…"
          onChange={(event) => setFeedback(event.target.value)}
          onBlur={() => {
            const trimmed = feedback.trim();
            if (trimmed === (row.grade?.feedback ?? "").trim()) return;
            onChange({ ...edit, feedback: trimmed });
            flashSaved();
          }}
          className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-ink-soft transition-colors focus:border-brand/50"
        />
      </label>
    </div>
  );
}
