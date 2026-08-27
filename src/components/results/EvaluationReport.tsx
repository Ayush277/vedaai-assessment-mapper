"use client";

import { Award, CheckCircle2, Pencil, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GradingSummary, StudentResult } from "@/lib/types/assessment";
import {
  gradeBand,
  improvementsFrom,
  strengthsFrom,
  type QuestionRow,
} from "@/lib/view-model";

/**
 * The evaluation report, shown beside the answer sheet rather than on a page of
 * its own — a teacher checking a mark needs the handwriting and the reasoning
 * in view at the same time.
 *
 * Every number is computed from the grades currently in force, so a teacher's
 * edit moves the score, the band and the tallies together instead of leaving
 * the header disagreeing with the questions below it.
 */
export function EvaluationReport({
  student,
  rows,
  summary,
  editedCount,
  actions,
}: {
  student: StudentResult;
  rows: QuestionRow[];
  summary?: GradingSummary;
  editedCount: number;
  /** Export controls, rendered in the report header. */
  actions?: React.ReactNode;
}) {
  const graded = rows.filter((row) => row.grade);

  if (!summary || graded.length === 0) {
    const reason = student.degradations.find((entry) => entry.step === "grading");
    return (
      <section className="rounded-card border border-dashed border-line-strong bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <Award className="size-4 text-muted" strokeWidth={2} />
          Evaluation not available
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {reason?.message ??
            "Automatic evaluation did not run for this student, so no marks were awarded."}{" "}
          Question extraction, answer mapping and highlighting are unaffected.
        </p>
        {actions ? <div className="mt-2.5">{actions}</div> : null}
      </section>
    );
  }

  const band = gradeBand(summary.percentage);
  const counts = {
    correct: graded.filter((r) => r.grade!.evaluation === "correct").length,
    partial: graded.filter((r) => r.grade!.evaluation === "partial").length,
    incorrect: graded.filter((r) => r.grade!.evaluation === "incorrect").length,
    notAttempted: graded.filter((r) => r.grade!.evaluation === "not_attempted").length,
  };

  const tone =
    summary.percentage >= 75
      ? {
          text: "text-success-ink",
          ring: "stroke-success",
          bar: "bg-success",
          badge: "bg-success-soft text-success-ink",
        }
      : summary.percentage >= 40
        ? {
            text: "text-warn",
            ring: "stroke-warn",
            bar: "bg-warn",
            badge: "bg-warn-soft text-warn",
          }
        : {
            text: "text-danger-ink",
            ring: "stroke-danger",
            bar: "bg-danger",
            badge: "bg-danger-soft text-danger-ink",
          };

  const strengths = strengthsFrom(rows);
  const improvements = improvementsFrom(rows, summary);

  return (
    <section
      key={student.id}
      className="animate-veda-swap-in overflow-hidden rounded-card border border-line bg-surface shadow-sm"
    >
      <header className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3.5">
        <ScoreDial
          percentage={summary.percentage}
          obtained={summary.marksObtained}
          max={summary.maxMarks}
          ringClass={tone.ring}
        />

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Evaluation report
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("text-[22px] leading-none font-bold", tone.text)}>
              {band.letter}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                tone.badge,
              )}
            >
              {band.label}
            </span>
            <span className={cn("text-[13px] font-bold tabular-nums", tone.text)}>
              {summary.percentage}%
            </span>
          </span>
          {editedCount > 0 ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand">
              <Pencil className="size-3" strokeWidth={2.5} />
              {editedCount} teacher {editedCount === 1 ? "edit" : "edits"} applied
            </span>
          ) : null}
        </span>

        {actions ? <span className="shrink-0">{actions}</span> : null}
      </header>

      <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
        <Tally label="Correct" value={counts.correct} tone="success" />
        <Tally label="Partial" value={counts.partial} tone="warn" />
        <Tally label="Incorrect" value={counts.incorrect} tone="danger" />
        <Tally label="Unanswered" value={counts.notAttempted} />
      </dl>

      {summary.summary ? (
        <div className="border-b border-line bg-brand-soft/40 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-ink">
            <Sparkles className="size-3.5 text-brand" strokeWidth={2.2} />
            Overall feedback
          </p>
          <p className="text-[12px] leading-relaxed text-ink-soft">{summary.summary}</p>
        </div>
      ) : null}

      <div className="grid gap-px bg-line sm:grid-cols-2">
        <ReportList
          title="Strengths"
          Icon={CheckCircle2}
          iconClass="text-success"
          items={strengths}
          empty="No question was fully correct yet."
        />
        <ReportList
          title="Areas to improve"
          Icon={Target}
          iconClass="text-warn"
          items={improvements}
          empty="Nothing outstanding — every question scored full marks."
        />
      </div>
    </section>
  );
}

/**
 * The score, as a ring.
 *
 * Green is the resting state because most marked work lands there and a
 * teacher scanning a class reads colour before digits. It steps to amber and
 * red only where the score genuinely warrants it — a failing total shown in
 * green would be the one piece of this screen that lies.
 */
function ScoreDial({
  percentage,
  obtained,
  max,
  ringClass,
}: {
  percentage: number;
  obtained: number;
  max: number;
  ringClass: string;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <span className="relative grid size-[86px] shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={radius}
          className="fill-none stroke-line"
          strokeWidth="8"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          className={cn(
            "fill-none transition-[stroke-dasharray] duration-700 ease-out",
            ringClass,
          )}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <span className="relative text-center leading-none">
        <span className="block text-[26px] font-bold text-ink tabular-nums">
          {obtained}
        </span>
        <span className="mt-0.5 block text-[10px] font-medium text-muted tabular-nums">
          out of {max}
        </span>
      </span>
    </span>
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
          "text-[18px] leading-tight font-bold tabular-nums transition-colors",
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

function ReportList({
  title,
  Icon,
  iconClass,
  items,
  empty,
}: {
  title: string;
  Icon: typeof CheckCircle2;
  iconClass: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-ink">
        <Icon className={cn("size-3.5", iconClass)} strokeWidth={2.2} />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft"
            >
              <span className={cn("mt-1.5 size-1 shrink-0 rounded-full", iconClass.replace("text-", "bg-"))} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
