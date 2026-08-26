import "server-only";
import { randomBytes } from "node:crypto";
import { config } from "@/lib/config";
import { getProviders, ProviderError } from "@/lib/ai/provider";
import { gradeAssessment } from "@/lib/ai/grading";
import { DocumentError, normalizeDocument } from "@/lib/document/normalize";
import { transcribeDocument } from "@/lib/vision/transcribe";
import { extractQuestions } from "@/lib/extraction/questions";
import { extractAnswers } from "@/lib/extraction/answers";
import { mapAnswersToQuestions } from "@/lib/mapping/mapper";
import type {
  AssessmentResult,
  JobError,
  JobRecord,
  PipelineStage,
  ResultSummary,
  StageProgress,
} from "@/lib/types/assessment";
import { initialStages } from "./stages";
import { sweepExpiredJobs, writeJob, writePageImage } from "./job-store";

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

export function createJobId(): string {
  return randomBytes(12).toString("hex");
}

class StageTracker {
  private readonly record: JobRecord;

  constructor(jobId: string, includeGrading: boolean) {
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

  async detail(stage: PipelineStage, detail: string): Promise<void> {
    const entry = this.find(stage);
    if (entry && entry.state === "active") {
      entry.detail = detail;
      await this.flush();
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
    await writeJob(this.record);
  }
}

function toJobError(error: unknown, stage: PipelineStage): JobError {
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
    if (error.status === 401 || error.status === 403) {
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
    return {
      code: "PROVIDER_ERROR",
      message: "The AI service could not be reached. Please try again in a moment.",
      retryable: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const isProvider = /fetch|network|timeout|abort/i.test(message);

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
  if (isProvider) {
    return {
      code: "PROVIDER_ERROR",
      message:
        "The AI service could not be reached. Please try again in a moment.",
      retryable: true,
    };
  }
  return {
    code: "INTERNAL",
    message: "Something went wrong while processing these files.",
    retryable: true,
  };
}

export async function createJob(includeGrading: boolean): Promise<JobRecord> {
  const jobId = createJobId();
  const tracker = new StageTracker(jobId, includeGrading);
  await writeJob(tracker.snapshot);
  return tracker.snapshot;
}

export async function runPipeline(params: {
  jobId: string;
  questionPaper: UploadInput;
  answerSheet: UploadInput;
}): Promise<void> {
  const { jobId, questionPaper, answerSheet } = params;
  const includeGrading = config.gradingEnabled;
  const tracker = new StageTracker(jobId, includeGrading);
  // Re-use the id created by createJob so the frontend's poll keeps working.
  tracker.snapshot.id = jobId;

  let stage: PipelineStage = "uploading";
  const warnings: string[] = [];

  try {
    void sweepExpiredJobs();

    const providers = await getProviders();

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

    await Promise.all([
      ...paper.bitmaps.map((bitmap) =>
        writePageImage(jobId, "question-paper", bitmap.pageNumber, bitmap.png),
      ),
      ...sheet.bitmaps.map((bitmap) =>
        writePageImage(jobId, "answer-sheet", bitmap.pageNumber, bitmap.png),
      ),
    ]);

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

    const paperTranscript = await transcribeDocument({
      bitmaps: paper.bitmaps,
      mode: "printed",
      vision: providers.vision,
      onPageStart: (pageNumber, total) => {
        void tracker.detail("reading-question-paper", `Page ${pageNumber} of ${total}`);
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
      return;
    }
    await tracker.complete(
      stage,
      `${questionResult.questions.length} question(s) found`,
    );

    /* --------------------------- Answer sheet -------------------------- */
    stage = "reading-answer-sheet";
    await tracker.begin(stage, `Page 1 of ${sheet.bitmaps.length}`);

    const sheetTranscript = await transcribeDocument({
      bitmaps: sheet.bitmaps,
      mode: "handwritten",
      vision: providers.vision,
      onPageStart: (pageNumber, total) => {
        void tracker.detail("reading-answer-sheet", `Page ${pageNumber} of ${total}`);
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
      return;
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
    let grading: Awaited<ReturnType<typeof gradeAssessment>> = null;
    if (includeGrading) {
      stage = "grading";
      await tracker.begin(stage);
      try {
        grading = await gradeAssessment({
          questions: questionResult.questions,
          answers: answerResult.answers,
          mappings: mappingResult.mappings,
          reasoning: providers.reasoning,
        });
      } catch {
        grading = null;
      }
      if (grading) {
        await tracker.complete(
          stage,
          `${grading.summary.marksObtained}/${grading.summary.maxMarks} marks`,
        );
      } else {
        await tracker.skip(stage, "Grading unavailable for this run");
      }
    }

    /* ------------------------------ Result ----------------------------- */
    stage = "preparing-results";
    await tracker.begin(stage);

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
      warnings: [...new Set(warnings)],
      provider: {
        id: providers.vision.id,
        model: providers.vision.model,
        degraded: providers.vision.degraded,
      },
    };

    await tracker.complete(stage);
    await tracker.succeed(result);
  } catch (error) {
    // Log the real cause server-side; the client only ever sees the sanitized
    // message built by toJobError, which never contains keys or stack traces.
    console.error(`[pipeline ${jobId}] failed during "${stage}":`, error);
    await tracker.fail(toJobError(error, stage), stage);
  }
}
