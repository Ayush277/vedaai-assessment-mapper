import { AlertTriangle, Check, CircleSlash, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Evaluation } from "@/lib/types/assessment";

type Verdict = Evaluation | "needs_review";

/**
 * Colour is never the only signal here: each verdict carries its own icon and
 * word, so the state survives a colour-blind reader, a greyscale printout and a
 * screenshot in a report.
 */
const VERDICTS: Record<
  Verdict,
  { label: string; Icon: typeof Check; className: string }
> = {
  correct: {
    label: "Correct",
    Icon: Check,
    className: "bg-success-soft text-success-ink border-success/25",
  },
  partial: {
    label: "Partial",
    Icon: Minus,
    className: "bg-warn-soft text-warn border-warn/30",
  },
  incorrect: {
    label: "Incorrect",
    Icon: X,
    className: "bg-danger-soft text-danger-ink border-danger/25",
  },
  not_attempted: {
    label: "Not attempted",
    Icon: CircleSlash,
    className: "bg-panel text-muted border-line",
  },
  needs_review: {
    label: "Needs review",
    Icon: AlertTriangle,
    className: "bg-warn-soft text-warn border-warn/30",
  },
};

export function EvaluationBadge({
  verdict,
  className,
}: {
  verdict: Verdict;
  className?: string;
}) {
  const { label, Icon, className: tone } = VERDICTS[verdict];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] leading-5 font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={3} aria-hidden />
      {label}
    </span>
  );
}
