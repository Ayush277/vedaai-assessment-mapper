import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { MappingStatus } from "@/lib/types/assessment";

const CONFIG: Record<
  MappingStatus,
  { tone: "success" | "danger" | "warn" | "brand"; label: string; Icon: typeof CheckCircle2 }
> = {
  matched: { tone: "success", label: "Answered", Icon: CheckCircle2 },
  needs_review: { tone: "warn", label: "Needs review", Icon: AlertTriangle },
  unanswered: { tone: "danger", label: "Unanswered", Icon: CircleSlash },
  unmatched: { tone: "brand", label: "Unmatched", Icon: HelpCircle },
};

export function StatusPill({
  status,
  className,
}: {
  status: MappingStatus;
  className?: string;
}) {
  const { tone, label, Icon } = CONFIG[status];
  return (
    <Badge tone={tone} className={className}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </Badge>
  );
}
