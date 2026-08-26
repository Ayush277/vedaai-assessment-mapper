/**
 * Core domain model for the extraction / mapping pipeline.
 *
 * Coordinate convention (single source of truth for the whole app):
 * every bounding box that leaves `lib/vision` is a `NormalizedBoundingBox`
 * with x/y/width/height in the range 0..1, relative to the *rendered page
 * image* of the document it belongs to, origin at the top-left.
 *
 * Providers hand back pixels, percentages or polygons; conversion to this
 * representation happens at the provider boundary and nowhere else.
 */

/** Box in normalized page space. All values 0..1, origin top-left. */
export type NormalizedBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Box in raw pixel space of a specific page image. Internal to lib/vision. */
export type PixelBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentKind = "question-paper" | "answer-sheet";

/** A single rendered page of an uploaded document. */
export type DocumentPage = {
  pageNumber: number;
  /** URL the browser can fetch the rendered page image from. */
  imageUrl: string;
  /** Pixel dimensions of the rendered image. */
  width: number;
  height: number;
};

export type SourceDocument = {
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  pageCount: number;
  pages: DocumentPage[];
};

/* -------------------------------------------------------------------------- */
/*                                  Questions                                 */
/* -------------------------------------------------------------------------- */

export type Question = {
  id: string;
  /** Label exactly as printed, e.g. "11(a)", "Q3", "5(ii)". */
  label: string;
  /** Canonical form used for matching, e.g. "11a". */
  normalizedLabel: string;
  text: string;
  pageNumber: number;
  bbox?: NormalizedBoundingBox;
  marks?: number;
  section?: string;
  /** Question id of the parent when this is a labelled sub-part. */
  parentId?: string;
  /** Printed order index. The UI always renders by this, never by AI output. */
  order: number;
};

/* -------------------------------------------------------------------------- */
/*                                   Answers                                  */
/* -------------------------------------------------------------------------- */

export type AnswerRegion = {
  pageNumber: number;
  bbox: NormalizedBoundingBox;
};

export type Answer = {
  id: string;
  /** Question label the student wrote next to this answer, if any was read. */
  recognizedLabel?: string;
  normalizedRecognizedLabel?: string;
  text: string;
  /** One region per contiguous block; multiple pages => multi-page answer. */
  regions: AnswerRegion[];
  /** OCR/vision confidence for the transcription, 0..1. */
  confidence: number;
  /** True when the writing appears cut off at the bottom of a page. */
  appearsIncomplete: boolean;
  /** Reading order across the whole answer sheet. */
  order: number;
};

/* -------------------------------------------------------------------------- */
/*                                   Mapping                                  */
/* -------------------------------------------------------------------------- */

export type MappingMethod =
  | "explicit_label"
  | "fuzzy_label"
  | "structural_order"
  | "semantic_match"
  | "llm_reasoning"
  | "continuation";

export type MappingStatus =
  | "matched"
  | "needs_review"
  | "unanswered"
  | "unmatched";

export type ConfidenceBand = "high" | "medium" | "low" | "none";

export type AnswerMapping = {
  questionId: string;
  answerId?: string;
  confidence: number;
  band: ConfidenceBand;
  status: MappingStatus;
  methods: MappingMethod[];
  /** Human-readable justification shown in the UI when confidence is low. */
  reasons: string[];
};

/* -------------------------------------------------------------------------- */
/*                                   Grading                                  */
/* -------------------------------------------------------------------------- */

export type Evaluation = "correct" | "partial" | "incorrect" | "not_attempted";

export type QuestionGrade = {
  questionId: string;
  marksObtained: number;
  maxMarks: number;
  evaluation: Evaluation;
  feedback: string;
  confidence: number;
  /** Set when answer-extraction confidence was too low to grade safely. */
  requiresReview: boolean;
};

export type GradingSummary = {
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  summary: string;
  improvementAreas: string[];
};

/* -------------------------------------------------------------------------- */
/*                                   Result                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                 Degradation                                */
/* -------------------------------------------------------------------------- */

/**
 * Why an optional AI step did not run.
 *
 * The extraction, mapping and highlighting stages are mandatory and fail the
 * run loudly. Question structuring, semantic similarity and grading are
 * enhancements layered on top of deterministic logic, so they degrade instead —
 * but a step that quietly does nothing is indistinguishable from one that was
 * never configured, so the reason travels all the way to the results screen.
 */
export type DegradationKind =
  | "quota"
  | "credentials"
  | "misconfigured"
  | "network"
  | "provider_unavailable"
  | "unusable_response"
  | "not_configured";

export type DegradationStep =
  | "question-structuring"
  | "semantic-matching"
  | "grading";

export type Degradation = {
  step: DegradationStep;
  kind: DegradationKind;
  /** User-facing sentence. Never contains provider bodies or keys. */
  message: string;
};

/** True for the kinds a teacher can actually act on right now. */
export function isActionableDegradation(kind: DegradationKind): boolean {
  return kind === "quota" || kind === "credentials" || kind === "misconfigured";
}

export type ResultSummary = {
  totalQuestions: number;
  answered: number;
  unanswered: number;
  needsReview: number;
  unmatchedAnswers: number;
};

export type AssessmentResult = {
  jobId: string;
  questionPaper: SourceDocument;
  answerSheet: SourceDocument;
  questions: Question[];
  answers: Answer[];
  mappings: AnswerMapping[];
  /** Answers that could not be linked to any question. */
  unmatchedAnswerIds: string[];
  summary: ResultSummary;
  grades?: QuestionGrade[];
  gradingSummary?: GradingSummary;
  /** Non-fatal problems worth surfacing, e.g. "page 3 had no readable text". */
  warnings: string[];
  /** Optional AI steps that did not run, and why. */
  degradations: Degradation[];
  /** Which provider actually produced the extraction, for honest reporting. */
  provider: {
    id: string;
    model: string;
    /** True when running on local OCR because no API key was configured. */
    degraded: boolean;
  };
  isDemo?: boolean;
};

/* -------------------------------------------------------------------------- */
/*                                    Jobs                                    */
/* -------------------------------------------------------------------------- */

export const PIPELINE_STAGES = [
  "uploading",
  "reading-question-paper",
  "detecting-questions",
  "reading-answer-sheet",
  "detecting-answers",
  "mapping",
  "checking-unanswered",
  "grading",
  "preparing-results",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type StageState = "pending" | "active" | "done" | "skipped" | "failed";

export type StageProgress = {
  stage: PipelineStage;
  label: string;
  state: StageState;
  /** Optional detail line, e.g. "page 2 of 6". */
  detail?: string;
};

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type JobError = {
  code:
    | "INVALID_FILE"
    | "EMPTY_DOCUMENT"
    | "QUESTION_EXTRACTION_FAILED"
    | "ANSWER_EXTRACTION_FAILED"
    | "PROVIDER_ERROR"
    | "INTERNAL";
  /** User-facing message. Never contains stack traces or keys. */
  message: string;
  retryable: boolean;
};

export type JobRecord = {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  stages: StageProgress[];
  result?: AssessmentResult;
  error?: JobError;
};
