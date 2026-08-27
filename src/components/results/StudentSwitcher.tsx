"use client";

import { ChevronLeft, ChevronRight, FileWarning, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentResult } from "@/lib/types/assessment";

/**
 * Who is being reviewed, and how to move on.
 *
 * A teacher marking a class works in sequence, so Next/Previous are the primary
 * control and the dropdown is for jumping. The name is the largest thing here
 * on purpose: it is the one piece of state that must never be ambiguous when
 * the rest of the screen changes underneath it.
 */
export function StudentSwitcher({
  students,
  current,
  index,
  onSelect,
  score,
}: {
  students: StudentResult[];
  current: StudentResult;
  index: number;
  onSelect: (studentId: string) => void;
  score?: { marksObtained: number; maxMarks: number; percentage: number };
}) {
  const previous = students[index - 1];
  const next = students[index + 1];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">
        {current.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("") || "S"}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            key={current.id}
            className="animate-veda-swap-in block truncate text-[15px] leading-tight font-bold text-ink"
          >
            {current.name}
          </span>
          {current.error ? (
            <FileWarning
              className="size-3.5 shrink-0 text-danger"
              strokeWidth={2.2}
              aria-label="This sheet could not be read"
            />
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          <Users className="size-3" strokeWidth={2} />
          Student {index + 1} of {students.length}
          {score ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-ink-soft tabular-nums">
                {score.marksObtained}/{score.maxMarks}
              </span>
            </>
          ) : null}
        </span>
      </span>

      {students.length > 1 ? (
        <label className="min-w-0">
          <span className="sr-only">Jump to a student</span>
          <select
            value={current.id}
            onChange={(event) => onSelect(event.target.value)}
            className="h-8 max-w-[170px] rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong"
          >
            {students.map((student, position) => (
              <option key={student.id} value={student.id}>
                {position + 1}. {student.name}
                {student.error ? " (unreadable)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
        <button
          type="button"
          onClick={() => previous && onSelect(previous.id)}
          disabled={!previous}
          aria-label={previous ? `Previous student: ${previous.name}` : "No previous student"}
          title={previous?.name}
          className={cn(
            "grid size-7 place-items-center rounded-full transition-colors",
            previous
              ? "text-ink-soft hover:bg-panel active:scale-95"
              : "text-line-strong",
          )}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => next && onSelect(next.id)}
          disabled={!next}
          aria-label={next ? `Next student: ${next.name}` : "No next student"}
          title={next?.name}
          className={cn(
            "grid h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium transition-colors",
            next ? "text-ink-soft hover:bg-panel active:scale-95" : "text-line-strong",
          )}
        >
          <span className="flex items-center gap-1">
            Next
            <ChevronRight className="size-4" />
          </span>
        </button>
      </span>
    </div>
  );
}
