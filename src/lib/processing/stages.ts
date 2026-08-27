import {
  PIPELINE_STAGES,
  type PipelineStage,
  type StageProgress,
} from "@/lib/types/assessment";

const STAGE_LABELS: Record<PipelineStage, string> = {
  uploading: "Uploading files",
  "reading-question-paper": "Reading question paper",
  "detecting-questions": "Detecting questions",
  "reading-answer-sheet": "Reading answer sheets",
  "detecting-answers": "Detecting handwritten answers",
  mapping: "Mapping answers to questions",
  "checking-unanswered": "Checking unanswered questions",
  grading: "Evaluating answers",
  "preparing-results": "Preparing results",
};

export function initialStages(includeGrading: boolean): StageProgress[] {
  return PIPELINE_STAGES.filter(
    (stage) => includeGrading || stage !== "grading",
  ).map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    state: "pending" as const,
  }));
}

/** Percentage derived from completed stages — never a fabricated timer. */
export function stageProgressPercent(stages: StageProgress[]): number {
  if (stages.length === 0) return 0;
  const done = stages.filter(
    (s) => s.state === "done" || s.state === "skipped",
  ).length;
  const active = stages.some((s) => s.state === "active") ? 0.5 : 0;
  return Math.round(((done + active) / stages.length) * 100);
}

export { STAGE_LABELS };
