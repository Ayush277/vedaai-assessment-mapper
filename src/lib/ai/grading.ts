import "server-only";
import type {
  Answer,
  AnswerMapping,
  Evaluation,
  GradingSummary,
  Question,
  QuestionGrade,
} from "@/lib/types/assessment";
import type { ReasoningProvider } from "./provider";
import { GRADING_SYSTEM } from "./prompts";
import { asArray, asConfidence, asNumber, asString } from "./json";

/**
 * Optional grading pass.
 *
 * Kept deliberately small: one batched call for the whole paper. Grading is
 * explicitly secondary to extraction, mapping and highlighting, so it must
 * never slow those down or fail the run — every error path here returns null
 * and the results screen simply renders without scores.
 */

const EVALUATIONS: Evaluation[] = ["correct", "partial", "incorrect", "not_attempted"];
const DEFAULT_MAX_MARKS = 1;

export type GradingResult = {
  grades: QuestionGrade[];
  summary: GradingSummary;
};

function toEvaluation(value: unknown): Evaluation {
  const text = asString(value).toLowerCase().trim().replace(/\s+/g, "_");
  return (EVALUATIONS as string[]).includes(text)
    ? (text as Evaluation)
    : "partial";
}

export async function gradeAssessment(params: {
  questions: Question[];
  answers: Answer[];
  mappings: AnswerMapping[];
  reasoning: ReasoningProvider | null;
}): Promise<GradingResult | null> {
  const { questions, answers, mappings, reasoning } = params;
  if (!reasoning) return null;

  const answerById = new Map(answers.map((answer) => [answer.id, answer]));
  const mappingByQuestion = new Map(
    mappings.map((mapping) => [mapping.questionId, mapping]),
  );

  const attempted = questions.filter((question) => {
    const mapping = mappingByQuestion.get(question.id);
    return Boolean(mapping?.answerId);
  });

  // Unanswered questions score zero deterministically — no reason to spend a
  // model call establishing that an absent answer is worth no marks.
  const notAttempted: QuestionGrade[] = questions
    .filter((question) => !attempted.includes(question))
    .map((question) => ({
      questionId: question.id,
      marksObtained: 0,
      maxMarks: question.marks ?? DEFAULT_MAX_MARKS,
      evaluation: "not_attempted" as const,
      feedback: "No answer was found for this question.",
      confidence: 1,
      requiresReview: false,
    }));

  if (attempted.length === 0) {
    const maxMarks = notAttempted.reduce((sum, grade) => sum + grade.maxMarks, 0);
    return {
      grades: notAttempted,
      summary: {
        marksObtained: 0,
        maxMarks,
        percentage: 0,
        summary: "No answers could be matched to the questions on this paper.",
        improvementAreas: [],
      },
    };
  }

  const prompt = attempted
    .map((question) => {
      const mapping = mappingByQuestion.get(question.id);
      const answer = mapping?.answerId ? answerById.get(mapping.answerId) : undefined;
      return [
        `questionId: ${question.id}`,
        `label: ${question.label}`,
        `maxMarks: ${question.marks ?? DEFAULT_MAX_MARKS}`,
        `question: ${question.text.slice(0, 800)}`,
        `ocrConfidence: ${(answer?.confidence ?? 0).toFixed(2)}`,
        `studentAnswer: ${answer?.text.slice(0, 1500) ?? ""}`,
        "---",
      ].join("\n");
    })
    .join("\n");

  const response = await reasoning.completeJson({
    system: GRADING_SYSTEM,
    prompt: `Mark the following ${attempted.length} answers.\n\n${prompt}`,
    maxOutputTokens: 8192,
  });

  if (!response) return null;

  const parsed = response as Record<string, unknown>;
  const rows = asArray(parsed.grades);
  if (rows.length === 0) return null;

  const byQuestion = new Map<string, QuestionGrade>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const questionId = asString(record.questionId);
    const question = attempted.find((entry) => entry.id === questionId);
    if (!question) continue;

    const maxMarks = Math.max(
      1,
      asNumber(record.maxMarks, question.marks ?? DEFAULT_MAX_MARKS),
    );
    const marksObtained = Math.min(
      maxMarks,
      Math.max(0, asNumber(record.marksObtained, 0)),
    );
    const mapping = mappingByQuestion.get(questionId);

    byQuestion.set(questionId, {
      questionId,
      marksObtained,
      maxMarks,
      evaluation: toEvaluation(record.evaluation),
      feedback: asString(record.feedback).trim() || "No feedback was generated.",
      confidence: asConfidence(record.confidence, 0.6),
      // Anything the mapper flagged is also flagged here — a grade computed
      // against a possibly-wrong answer must not look authoritative.
      requiresReview:
        record.requiresReview === true || mapping?.status === "needs_review",
    });
  }

  // Any attempted question the model skipped still needs a row.
  for (const question of attempted) {
    if (byQuestion.has(question.id)) continue;
    byQuestion.set(question.id, {
      questionId: question.id,
      marksObtained: 0,
      maxMarks: question.marks ?? DEFAULT_MAX_MARKS,
      evaluation: "partial",
      feedback: "This answer could not be evaluated automatically.",
      confidence: 0,
      requiresReview: true,
    });
  }

  const grades = [...notAttempted, ...byQuestion.values()].sort((a, b) => {
    const orderA = questions.find((q) => q.id === a.questionId)?.order ?? 0;
    const orderB = questions.find((q) => q.id === b.questionId)?.order ?? 0;
    return orderA - orderB;
  });

  const marksObtained = grades.reduce((sum, grade) => sum + grade.marksObtained, 0);
  const maxMarks = grades.reduce((sum, grade) => sum + grade.maxMarks, 0);
  const overall = (parsed.overall ?? {}) as Record<string, unknown>;

  return {
    grades,
    summary: {
      marksObtained,
      maxMarks,
      percentage: maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0,
      summary: asString(overall.summary).trim(),
      improvementAreas: asArray(overall.improvementAreas)
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
        .slice(0, 4),
    },
  };
}
