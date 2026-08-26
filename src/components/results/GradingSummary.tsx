import { AlertTriangle, Award, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssessmentResult } from "@/lib/types/assessment";
import type { QuestionRow } from "@/lib/view-model";

/**
 * The result at a glance.
 *
 * Every number here is computed from the run's own grades and mappings — there
 * is no placeholder path. When grading did not run the component says so and
 * explains why, rather than rendering an empty scoreboard.
 */
export function GradingSummary({
  result,
  rows,
}: {
  result: AssessmentResult;
  rows: QuestionRow[];
}) {
  const grading = result.gradingSummary;
  const grades = result.grades ?? [];

  if (!grading || grades.length === 0) {
    const reason = (result.degradations ?? []).find(
      (entry) => entry.step === "grading",
    );
    return (
      <section className="rounded-card border border-dashed border-line-strong bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <Award className="size-4 text-muted" strokeWidth={2} />
          Marks not available
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {reason?.message ??
            "Automatic evaluation did not run for this assessment, so no marks were awarded."}{" "}
          Question extraction, answer mapping and highlighting are unaffected.
        </p>
      </section>
    );
  }

  const counts = {
    correct: grades.filter((g) => g.evaluation === "correct").length,
    partial: grades.filter((g) => g.evaluation === "partial").length,
    incorrect: grades.filter((g) => g.evaluation === "incorrect").length,
    notAttempted: grades.filter((g) => g.evaluation === "not_attempted").length,
    needsReview: grades.filter((g) => g.requiresReview).length,
  };

  const band =
    grading.percentage >= 75
      ? "text-success-ink"
      : grading.percentage >= 40
        ? "text-warn"
        : "text-danger-ink";

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft">
          <Award className="size-5 text-brand" strokeWidth={2} />
        </span>

        <span className="min-w-0">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Total score
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className={cn("text-[26px] leading-none font-bold tabular-nums", band)}>
              {grading.marksObtained}
            </span>
            <span className="text-[15px] font-semibold text-muted tabular-nums">
              / {grading.maxMarks}
            </span>
          </span>
        </span>

        <span className="ml-auto flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5">
          <TrendingUp className={cn("size-4", band)} strokeWidth={2.2} />
          <span className={cn("text-[15px] font-bold tabular-nums", band)}>
            {grading.percentage}%
          </span>
        </span>
      </div>

      <div
        className="h-1.5 w-full bg-line"
        role="img"
        aria-label={`Score ${grading.percentage} percent`}
      >
        <div
          className={cn(
            "h-full rounded-r-full transition-[width] duration-700 ease-out",
            grading.percentage >= 75
              ? "bg-success"
              : grading.percentage >= 40
                ? "bg-warn"
                : "bg-danger",
          )}
          style={{ width: `${Math.max(2, grading.percentage)}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
        <Tally label="Correct" value={counts.correct} tone="success" />
        <Tally label="Partial" value={counts.partial} tone="warn" />
        <Tally label="Incorrect" value={counts.incorrect} tone="danger" />
        <Tally label="Unanswered" value={counts.notAttempted} />
        <Tally label="Needs review" value={counts.needsReview} tone="warn" />
      </dl>

      {grading.summary ? (
        <div className="border-t border-line bg-brand-soft/40 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-ink">
            <Sparkles className="size-3.5 text-brand" strokeWidth={2.2} />
            Overall AI feedback
          </p>
          <p className="text-[12px] leading-relaxed text-ink-soft">{grading.summary}</p>

          {grading.improvementAreas.length > 0 ? (
            <>
              <p className="mt-2.5 mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                Areas to improve
              </p>
              <ul className="space-y-1">
                {grading.improvementAreas.map((area) => (
                  <li
                    key={area}
                    className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-soft"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
                    {area}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {counts.needsReview > 0 ? (
        <p className="flex items-start gap-1.5 border-t border-line bg-warn-soft px-4 py-2 text-[11px] leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
          {counts.needsReview} answer{counts.needsReview === 1 ? "" : "s"} could not be
          read or matched with confidence. Check {counts.needsReview === 1 ? "it" : "them"}{" "}
          before recording this score.
        </p>
      ) : null}

      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Marks come from{" "}
        {rows.filter((row) => typeof row.question.marks === "number").length} of{" "}
        {rows.length} questions with printed marks; the rest default to 1 mark each.
      </p>
    </section>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warn" | "danger";
}) {
  return (
    <div className="px-4 py-2.5">
      <dd
        className={cn(
          "text-[18px] leading-tight font-bold tabular-nums",
          tone === "success" && "text-success-ink",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger-ink",
          !tone && "text-ink",
        )}
      >
        {value}
      </dd>
      <dt className="truncate text-[11px] text-muted">{label}</dt>
    </div>
  );
}
