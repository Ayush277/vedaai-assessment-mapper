import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger" | "warn" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-panel text-ink-soft border-line",
  success: "bg-success-soft text-success-ink border-success/20",
  danger: "bg-danger-soft text-danger-ink border-danger/20",
  warn: "bg-warn-soft text-warn border-warn/25",
  brand: "bg-brand-soft text-brand border-brand/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] leading-5 font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
