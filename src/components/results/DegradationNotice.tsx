import { KeyRound, TriangleAlert, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isActionableDegradation,
  type Degradation,
  type DegradationKind,
} from "@/lib/types/assessment";

const ICONS: Partial<Record<DegradationKind, typeof TriangleAlert>> = {
  credentials: KeyRound,
  misconfigured: KeyRound,
  network: WifiOff,
  provider_unavailable: WifiOff,
};

const HEADINGS: Record<DegradationKind, string> = {
  quota: "AI quota ran out during this run",
  credentials: "The AI key was rejected",
  misconfigured: "The AI provider rejected the request",
  network: "The AI service was unreachable",
  provider_unavailable: "The AI service was overloaded",
  unusable_response: "The AI service returned something unusable",
  not_configured: "Running without an AI provider",
};

/**
 * Shown when an optional AI step did not run.
 *
 * The distinction that matters to a teacher is whether the run is *missing*
 * something they were expecting. A blank grading column with no explanation
 * reads as a broken app; naming the cause — an expired key, an exhausted quota
 * — tells them whether to retry now, fix a setting, or ignore it.
 */
export function DegradationNotice({
  degradations,
}: {
  degradations: Degradation[];
}) {
  if (degradations.length === 0) return null;

  // One cause usually knocks out several steps; lead with the actionable one.
  const lead =
    degradations.find((entry) => isActionableDegradation(entry.kind)) ??
    degradations[0];
  const actionable = isActionableDegradation(lead.kind);
  const Icon = ICONS[lead.kind] ?? TriangleAlert;

  return (
    <section
      className={cn(
        "rounded-card border px-3 py-2.5",
        actionable
          ? "border-danger/25 bg-danger-soft"
          : "border-warn/25 bg-warn-soft",
      )}
    >
      <h3
        className={cn(
          "flex items-center gap-1.5 text-[12px] font-bold",
          actionable ? "text-danger-ink" : "text-warn",
        )}
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />
        {HEADINGS[lead.kind]}
      </h3>
      <ul
        className={cn(
          "mt-1.5 space-y-1 text-[11px] leading-relaxed",
          actionable ? "text-danger-ink/90" : "text-warn",
        )}
      >
        {degradations.map((entry) => (
          <li key={`${entry.step}-${entry.kind}`}>{entry.message}</li>
        ))}
      </ul>
      <p
        className={cn(
          "mt-1.5 text-[11px] font-medium",
          actionable ? "text-danger-ink" : "text-warn",
        )}
      >
        Question extraction, answer mapping and highlighting are unaffected.
      </p>
    </section>
  );
}
