import { cn } from "@/lib/utils";

/**
 * How much to trust one row.
 *
 * Two different numbers get conflated when you say "accuracy": how well the
 * handwriting was *read*, and how sure we are it belongs to *this* question.
 * A crisp answer matched by a guess and a smudged answer matched by an explicit
 * label are both "uncertain", for opposite reasons, and a teacher checking the
 * paper needs to know which. They are shown separately.
 */
export function AccuracyMeter({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone =
    percent >= 85
      ? { bar: "bg-success", text: "text-success-ink" }
      : percent >= 60
        ? { bar: "bg-warn", text: "text-warn" }
        : { bar: "bg-danger", text: "text-danger-ink" };

  return (
    <div className={cn("min-w-0 flex-1", className)} title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-semibold tracking-wide text-muted uppercase">
          {label}
        </span>
        <span className={cn("text-[11px] font-bold tabular-nums", tone.text)}>
          {percent}%
        </span>
      </div>
      <div
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`${label}: ${percent} percent`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone.bar)}
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </div>
    </div>
  );
}
