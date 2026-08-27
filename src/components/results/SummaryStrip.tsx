import { cn } from "@/lib/utils";
import type { ResultSummary } from "@/lib/types/assessment";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger" | "warn" | "brand";
}) {
  return (
    <div className="min-w-0 flex-1 basis-[104px] px-3 py-2">
      <p
        className={cn(
          "text-[19px] leading-tight font-bold tabular-nums",
          tone === "success" && "text-success-ink",
          tone === "danger" && "text-danger-ink",
          tone === "warn" && "text-warn",
          tone === "brand" && "text-brand",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </div>
  );
}

export function SummaryStrip({ summary }: { summary: ResultSummary }) {
  return (
    <div className="flex flex-wrap items-stretch rounded-card border border-line bg-surface *:border-l *:border-line first:*:border-l-0">
      <Stat label="Questions" value={summary.totalQuestions} />
      <Stat label="Answered" value={summary.answered} tone="success" />
      <Stat label="Unanswered" value={summary.unanswered} tone="danger" />
      <Stat label="Needs review" value={summary.needsReview} tone="warn" />
      <Stat label="Unmatched" value={summary.unmatchedAnswers} tone="brand" />
    </div>
  );
}
