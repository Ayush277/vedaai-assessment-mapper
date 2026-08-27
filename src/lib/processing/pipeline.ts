import "server-only";
import { randomBytes } from "node:crypto";
import { config } from "@/lib/config";
import {
  classifyDegradation,
  describeDegradation,
  getProviders,
  ProviderAuthError,
  ProviderError,
  ProviderNetworkError,
} from "@/lib/ai/provider";
import {
  gradeAssessment,
  type GradingOutcome,
  type GradingResult,
} from "@/lib/ai/grading";
import { generateModelAnswers } from "@/lib/ai/model-answers";
import {
  DocumentError,
  normalizeDocument,
  type PageBitmap,
} from "@/lib/document/normalize";
import { transcribeDocument } from "@/lib/vision/transcribe";
import { extractQuestions } from "@/lib/extraction/questions";
import { extractAnswers } from "@/lib/extraction/answers";
import { mapAnswersToQuestions } from "@/lib/mapping/mapper";
import type {
  AssessmentResult,
  Degradation,
  DegradationKind,
  JobError,
  ModelAnswer,
  JobRecord,
  PipelineStage,
  ResultSummary,
  SourceDocument,
  StageProgress,
} from "@/lib/types/assessment";
import { initialStages } from "./stages";

/**
 * The processing pipeline, in the order the assignment specifies:
 *
 *   normalize documents -> segment pages -> transcribe regions ->
 *   extract questions -> extract answers -> map -> grade -> result
 *
 * Stage state is persisted after every transition so the frontend's polling
 * reflects work that has genuinely happened rather than an animated timer.
 */

export type UploadInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

/** Keep one entry per step, preferring the first (most specific) cause. */
function dedupeDegradations(entries: Degradation[]): Degradation[] {
  const byStep = new Map<string, Degradation>();
  for (const entry of entries) {
    if (!byStep.has(entry.step)) byStep.set(entry.step, entry);
  }
  return [...byStep.values()];
}

export function createJobId(): string {
  return randomBytes(12).toString("hex");
}

class StageTracker {
  private readonly record: JobRecord;

  constructor(
    jobId: string,
    includeGrading: boolean,
    /**
     * Where a progress snapshot goes.
     *
     * This used to be a write to `os.tmpdir()`, which is per-instance. On a
     * serverless host the upload lands on one instance and every progress poll
     * lands on another, so the job the client was told about did not exist
     * anywhere it could look — the run worked and the page showed "no longer
     * available". Publishing through an injected sink lets the caller stream
     * snapshots down the same request instead.
     */
    private readonly publish: (record: JobRecord) => void,
  ) {
    this.record = {
      id: jobId,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stages: initialStages(includeGrading),
    };
  }

  get snapshot(): JobRecord {
    return this.record;
  }

  private find(stage: PipelineStage): StageProgress | undefined {
    return this.record.stages.find((entry) => entry.stage === stage);
  }

  async begin(stage: PipelineStage, detail?: string): Promise<void> {
    const entry = this.find(stage);
    if (entry) {
      entry.state = "active";
      entry.detail = detail;
    }
    this.record.status = "processing";
    await this.flush();
  }

  /**
   * Progress detail is best-effort by nature: it is a nicety for the polling
   * UI, and losing one update matters far less than losing the run. Callers
   * fire this without awaiting, so a rejection here would surface as an
   * unhandled rejection and take the process down with it.
   */
  async detail(stage: PipelineStage, detail: string): Promise<void> {
    const entry = this.find(stage);
    if (!entry || entry.state !== "active") return;
    entry.detail = detail;
    try {
      await this.flush();
    } catch (error) {
      console.warn(
        `[pipeline ${this.record.id}] could not persist progress detail:`,
        error,
      );
    }
  }

  async complete(stage: PipelineStage, detail?: string): Promise<void> {
    const entry = this.find(stage);
    if (entry) {
      entry.state = "done";
      if (detail !== undefined) entry.detail = detail;
    }
    await this.flush();
  }

  async skip(stage: PipelineStage, detail?: string): Promise<void> {
    const entry = this.find(stage);
    if (entry) {
      entry.state = "skipped";
      entry.detail = detail;
    }
    await this.flush();
  }

  async fail(error: JobError, stage?: PipelineStage): Promise<void> {
    if (stage) {
      const entry = this.find(stage);
      if (entry) entry.state = "failed";
    }
    for (const entry of this.record.stages) {
      if (entry.state === "active") entry.state = "failed";
    }
    this.record.status = "failed";
    this.record.error = error;
    await this.flush();
  }

  async succeed(result: AssessmentResult): Promise<void> {
    this.record.status = "completed";
    this.record.result = result;
    await this.flush();
  }

  private async flush(): Promise<void> {
    this.record.updatedAt = Date.now();
    this.publish(this.record);
  }
}

/** Exported for tests: this classification decides what the teacher is told. */
export function toJobError(error: unknown, stage: PipelineStage): JobError {
  if (error instanceof DocumentError) {
    return {
      code: error.code === "EMPTY_FILE" ? "EMPTY_DOCUMENT" : "INVALID_FILE",
      message: error.message,
      retryable: false,
    };
  }

  // Provider problems are diagnosed before stage-specific wording, because
  // "could not read the answer sheet" would be actively misleading when the
  // real cause is a quota or a bad key.
  if (error instanceof ProviderError) {
    if (error.isRateLimit) {
      return {
        code: "PROVIDER_ERROR",
        message:
          "The AI service is rate limited right now. Wait a minute and try again — no credits were used for the incomplete pages.",
        retryable: true,
      };
    }
    if (error instanceof ProviderAuthError) {
      return {
        code: "PROVIDER_ERROR",
        message:
          "The AI provider rejected the configured credentials. Check AI_API_KEY in the deployment settings.",
        retryable: false,
      };
    }
    if (error.isPermanent) {
      return {
        code: "PROVIDER_ERROR",
        message:
          "The AI provider rejected the request. Check that AI_MODEL names a model your key can use.",
        retryable: false,
      };
    }
    if ((error.status ?? 0) >= 500) {
      return {
        code: "PROVIDER_ERROR",
        message:
          "The AI model is temporarily overloaded. This usually clears within a minute — please try again.",
        retryable: true,
      };
    }
    if (error instanceof ProviderNetworkError) {
      return {
        code: "PROVIDER_ERROR",
        message:
          "The connection to the AI service dropped before processing finished. Please try again.",
        retryable: true,
      };
    }
    return {
      code: "PROVIDER_ERROR",
      message: "The AI service could not be reached. Please try again in a moment.",
      retryable: true,
    };
  }

  // Anything that failed in transit is diagnosed before the stage-specific
  // wording below. Telling a teacher their question paper is illegible when
  // the real cause was a dropped connection sends them to fix the wrong thing.
  const message = error instanceof Error ? error.message : String(error);
  if (/\bfetch\b|network|timeout|timed out|abort|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return {
      code: "PROVIDER_ERROR",
      message:
        "The connection to the AI service dropped before processing finished. Please try again.",
      retryable: true,
    };
  }

  if (stage === "reading-question-paper" || stage === "detecting-questions") {
    return {
      code: "QUESTION_EXTRACTION_FAILED",
      message:
        "Could not reliably extract the questions from this document. Check that the question paper is legible and try again.",
      retryable: true,
    };
  }
  if (stage === "reading-answer-sheet" || stage === "detecting-answers") {
    return {
      code: "ANSWER_EXTRACTION_FAILED",
      message:
        "Could not reliably read the answer sheet. Check that the scan is clear and try again.",
      retryable: true,
    };
  }
  return {
    code: "INTERNAL",
    message: "Something went wrong while processing these files.",
    retryable: true,
  };
}

export async function runPipeline(params: {
  questionPaper: UploadInput;
  answerSheet: UploadInput;
  /** Called on every stage transition so the caller can stream progress. */
  onProgress: (record: JobRecord) => void;
}): Promise<JobRecord> {
  const { questionPaper, answerSheet, onProgress } = params;
  const jobId = createJobId();
  const includeGrading = config.gradingEnabled;
  const tracker = new StageTracker(jobId, includeGrading, onProgress);

  let stage: PipelineStage = "uploading";
  const warnings: string[] = [];
  const degradations: Degradation[] = [];

  try {
    const providers = await getProviders();

    /**
     * Read a document, falling back to local OCR if the cloud provider gives
     * out mid-run.
     *
     * Transcription is a mandatory stage, so a quota ceiling or a rejected key
     * would otherwise end the run with an error page. On a deployed demo that
     * is the worst outcome available: the visitor sees nothing work. Tesseract
     * needs no key and no quota, so the run completes with weaker handwriting
     * recognition — and the result is marked degraded, which the results screen
     * already explains in as many words.
     */
    let usedFallback = false;
    const transcribeWithFallback = async (
      params: Parameters<typeof transcribeDocument>[0],
    ) => {
      try {
        return await transcribeDocument(params);
      } catch (error) {
        const kind = classifyDegradation(error);
        const recoverable =
          kind === "quota" || kind === "credentials" || kind === "misconfigured";
        if (!recoverable || providers.vision.degraded) throw error;

        console.warn(
          `[pipeline ${jobId}] ${kind} from ${providers.vision.id}; falling back to local OCR`,
        );
        const { createLocalProviders } = await import("@/lib/ai/providers/local");
        usedFallback = true;
        fallbackKind = kind;
        return transcribeDocument({
          ...params,
          vision: createLocalProviders().vision,
        });
      }
    };
    let fallbackKind: DegradationKind | null = null;

    /* ------------------------------ Upload ----------------------------- */
    await tracker.begin("uploading");

    const paper = await normalizeDocument({
      kind: "question-paper",
      fileName: questionPaper.fileName,
      mimeType: questionPaper.mimeType,
      bytes: questionPaper.bytes,
      jobId,
    });
    const sheet = await normalizeDocument({
      kind: "answer-sheet",
      fileName: answerSheet.fileName,
      mimeType: answerSheet.mimeType,
      bytes: answerSheet.bytes,
      jobId,
    });

    // Inline the rendered pages. A separate image endpoint would have to read
    // them back from wherever the run happened, which is the same cross-instance
    // problem in a different shape.
    inlinePageImages(paper.document, paper.bitmaps);
    inlinePageImages(sheet.document, sheet.bitmaps);

    if (paper.document.pageCount > paper.bitmaps.length) {
      warnings.push(
        `Only the first ${paper.bitmaps.length} of ${paper.document.pageCount} question paper pages were processed.`,
      );
    }
    if (sheet.document.pageCount > sheet.bitmaps.length) {
      warnings.push(
        `Only the first ${sheet.bitmaps.length} of ${sheet.document.pageCount} answer sheet pages were processed.`,
      );
    }

    await tracker.complete(
      "uploading",
      `${paper.bitmaps.length + sheet.bitmaps.length} page(s) prepared`,
    );

    /* -------------------------- Question paper ------------------------- */
    stage = "reading-question-paper";
    await tracker.begin(stage, `Page 1 of ${paper.bitmaps.length}`);

    const paperTranscript = await transcribeWithFallback({
      bitmaps: paper.bitmaps,
      mode: "printed",
      vision: providers.vision,
      onPageStart: (pageNumber, total) => {
        void tracker.detail("reading-question-paper", `Page ${pageNumber} of ${total}`);
      },
      onPageNote: (pageNumber, total, note) => {
        void tracker.detail(
          "reading-question-paper",
          `Page ${pageNumber} of ${total} · ${note}`,
        );
      },
    });
    await tracker.complete(stage, `${paperTranscript.blocks.length} region(s) read`);

    stage = "detecting-questions";
    await tracker.begin(stage);
    const questionResult = await extractQuestions(
      paperTranscript,
      providers.reasoning,
    );
    warnings.push(...questionResult.warnings);
    degradations.push(...questionResult.degradations);

    if (questionResult.questions.length === 0) {
      await tracker.fail(
        {
          code: "QUESTION_EXTRACTION_FAILED",
          message:
            "Could not reliably extract the questions from this document. Make sure the file is a question paper with numbered questions.",
          retryable: true,
        },
        stage,
      );
      return tracker.snapshot;
    }
    await tracker.complete(
      stage,
      `${questionResult.questions.length} question(s) found`,
    );

    /* --------------------------- Answer sheet -------------------------- */
    stage = "reading-answer-sheet";
    await tracker.begin(stage, `Page 1 of ${sheet.bitmaps.length}`);

    const sheetTranscript = await transcribeWithFallback({
      bitmaps: sheet.bitmaps,
      mode: "handwritten",
      vision: providers.vision,
      onPageStart: (pageNumber, total) => {
        void tracker.detail("reading-answer-sheet", `Page ${pageNumber} of ${total}`);
      },
      onPageNote: (pageNumber, total, note) => {
        void tracker.detail(
          "reading-answer-sheet",
          `Page ${pageNumber} of ${total} · ${note}`,
        );
      },
    });
    await tracker.complete(stage, `${sheetTranscript.blocks.length} region(s) read`);

    stage = "detecting-answers";
    await tracker.begin(stage);
    const answerResult = extractAnswers(sheetTranscript);
    warnings.push(...answerResult.warnings);

    if (answerResult.answers.length === 0) {
      await tracker.fail(
        {
          code: "ANSWER_EXTRACTION_FAILED",
          message:
            "Could not reliably read the answer sheet. No handwritten answers were detected.",
          retryable: true,
        },
        stage,
      );
      return tracker.snapshot;
    }
    await tracker.complete(stage, `${answerResult.answers.length} answer(s) found`);

    /* ------------------------------ Mapping ---------------------------- */
    stage = "mapping";
    await tracker.begin(stage);
    const mappingResult = await mapAnswersToQuestions(
      questionResult.questions,
      answerResult.answers,
      { embeddings: providers.embeddings, reasoning: providers.reasoning },
    );
    degradations.push(...mappingResult.degradations);
    await tracker.complete(
      stage,
      `Matched using ${mappingResult.similarityMethod === "embedding" ? "embeddings" : "text similarity"}`,
    );

    stage = "checking-unanswered";
    await tracker.begin(stage);
    const summary: ResultSummary = {
      totalQuestions: questionResult.questions.length,
      answered: mappingResult.mappings.filter((m) => m.status === "matched").length,
      unanswered: mappingResult.mappings.filter((m) => m.status === "unanswered")
        .length,
      needsReview: mappingResult.mappings.filter((m) => m.status === "needs_review")
        .length,
      unmatchedAnswers: mappingResult.unmatchedAnswerIds.length,
    };
    if (summary.needsReview > 0) {
      warnings.push(
        `${summary.needsReview} answer(s) need review before you rely on the match.`,
      );
    }
    await tracker.complete(
      stage,
      `${summary.unanswered} unanswered, ${summary.unmatchedAnswers} unmatched`,
    );

    /* ------------------------------ Grading ---------------------------- */
    let grading: GradingResult | null = null;
    let modelAnswers: ModelAnswer[] | undefined;
    if (includeGrading) {
      stage = "grading";
      await tracker.begin(stage);

      let outcome: GradingOutcome;
      try {
        outcome = await gradeAssessment({
          questions: questionResult.questions,
          answers: answerResult.answers,
          mappings: mappingResult.mappings,
          reasoning: providers.reasoning,
        });
      } catch (error) {
        console.warn(`[pipeline ${jobId}] grading failed:`, error);
        outcome = { ok: false, kind: classifyDegradation(error) };
      }

      if (outcome.ok) {
        grading = outcome.result;
        await tracker.complete(
          stage,
          `${grading.summary.marksObtained}/${grading.summary.maxMarks} marks`,
        );
      } else {
        // Missing scores with no explanation read as a bug rather than a
        // degraded run, so the specific cause is carried to the results screen.
        const message = describeDegradation(outcome.kind, "grading");
        degradations.push({ step: "grading", kind: outcome.kind, message });
        await tracker.skip(stage, "Grading unavailable for this run");
      }

      // Write out what the skipped questions should have said. Same provider,
      // one more batched call, and only for questions with no answer at all.
      try {
        const expected = await generateModelAnswers({
          questions: questionResult.questions,
          mappings: mappingResult.mappings,
          reasoning: providers.reasoning,
        });
        if (expected.ok) {
          modelAnswers = expected.answers;
        } else {
          degradations.push({
            step: "model-answers",
            kind: expected.kind,
            message: describeDegradation(
              expected.kind,
              "writing expected answers for the unanswered questions",
            ),
          });
        }
      } catch (error) {
        console.warn(`[pipeline ${jobId}] model answers failed:`, error);
        degradations.push({
          step: "model-answers",
          kind: classifyDegradation(error),
          message: describeDegradation(
            classifyDegradation(error),
            "writing expected answers for the unanswered questions",
          ),
        });
      }
    }

    /* ------------------------------ Result ----------------------------- */
    stage = "preparing-results";
    await tracker.begin(stage);

    if (usedFallback && fallbackKind) {
      warnings.push(
        fallbackKind === "quota"
          ? "The AI provider's quota ran out during this run, so the pages were read with local OCR instead. Extraction and mapping completed, but handwriting recognition is weaker than usual."
          : "The AI provider could not be used for this run, so the pages were read with local OCR instead. Handwriting recognition is weaker than usual.",
      );
    }

    const result: AssessmentResult = {
      jobId,
      questionPaper: paper.document,
      answerSheet: sheet.document,
      questions: questionResult.questions,
      answers: answerResult.answers,
      mappings: mappingResult.mappings,
      unmatchedAnswerIds: mappingResult.unmatchedAnswerIds,
      summary,
      grades: grading?.grades,
      gradingSummary: grading?.summary,
      modelAnswers,
      warnings: [...new Set(warnings)],
      // De-duplicated by step: one quota exhaustion knocks out several optional
      // steps, and repeating the same sentence three times helps nobody.
      degradations: dedupeDegradations(degradations),
      provider: {
        id: usedFallback ? "local" : providers.vision.id,
        model: usedFallback ? "tesseract-eng" : providers.vision.model,
        degraded: usedFallback || providers.vision.degraded,
        localMode: usedFallback ? "no-key" : (config.localMode ?? undefined),
      },
    };

    await tracker.complete(stage);
    await tracker.succeed(result);
    return tracker.snapshot;
  } catch (error) {
    // Log the real cause server-side; the client only ever sees the sanitized
    // message built by toJobError, which never contains keys or stack traces.
    console.error(`[pipeline ${jobId}] failed during "${stage}":`, error);
    try {
      await tracker.fail(toJobError(error, stage), stage);
    } catch (writeError) {
      // If we cannot even record the failure the job would sit at "processing"
      // forever and the client would poll against a job that will never move.
      // Nothing is left to do but log it loudly; the client's stall detection
      // is what rescues the user from here.
      console.error(
        `[pipeline ${jobId}] could not report the failure state:`,
        writeError,
      );
    }
  }

  return tracker.snapshot;
}

/** Turn rendered pages into data URLs carried inside the result itself. */
function inlinePageImages(document: SourceDocument, bitmaps: PageBitmap[]): void {
  const byPage = new Map(bitmaps.map((bitmap) => [bitmap.pageNumber, bitmap]));
  for (const page of document.pages) {
    const bitmap = byPage.get(page.pageNumber);
    if (bitmap) {
      page.imageUrl = `data:image/png;base64,${bitmap.png.toString("base64")}`;
    }
  }
}
