import "server-only";
import type {
  AnswerMapping,
  DegradationKind,
  ModelAnswer,
  Question,
} from "@/lib/types/assessment";
import type { ReasoningProvider } from "./provider";
import { MODEL_ANSWER_SYSTEM } from "./prompts";
import { asArray, asString } from "./json";

/**
 * Expected answers for the questions the student left blank.
 *
 * A teacher looking at "Unanswered" wants to know what was being asked for, and
 * writing that out by hand for every skipped question is the tedious part of
 * marking. This is deliberately scoped to unanswered questions only: generating
 * a model answer for a question the student *did* attempt would invite
 * comparing the two as if the model's version were the mark scheme.
 */

/** Bound the cost of a paper where almost nothing was attempted. */
const MAX_QUESTIONS = 20;
const DEFAULT_MAX_MARKS = 1;

export type ModelAnswerOutcome =
  | { ok: true; answers: ModelAnswer[] }
  | { ok: false; kind: DegradationKind };

export async function generateModelAnswers(params: {
  questions: Question[];
  mappings: AnswerMapping[];
  reasoning: ReasoningProvider | null;
}): Promise<ModelAnswerOutcome> {
  const { questions, mappings, reasoning } = params;
  if (!reasoning) return { ok: false, kind: "not_configured" };

  const unanswered = new Set(
    mappings
      .filter((mapping) => mapping.status === "unanswered")
      .map((mapping) => mapping.questionId),
  );
  const targets = questions
    .filter((question) => unanswered.has(question.id))
    .slice(0, MAX_QUESTIONS);

  // Nothing was skipped, so there is nothing to write. Not a degradation.
  if (targets.length === 0) return { ok: true, answers: [] };

  const prompt = targets
    .map((question) =>
      [
        `questionId: ${question.id}`,
        `label: ${question.label}`,
        `maxMarks: ${question.marks ?? DEFAULT_MAX_MARKS}`,
        `question: ${question.text.slice(0, 800)}`,
        "---",
      ].join("\n"),
    )
    .join("\n");

  const response = await reasoning.completeJson({
    system: MODEL_ANSWER_SYSTEM,
    prompt: `Write the expected answer for these ${targets.length} unanswered question(s).\n\n${prompt}`,
    maxOutputTokens: 8192,
  });

  if (!response.ok) return { ok: false, kind: response.kind };

  const rows = asArray((response.value as Record<string, unknown>)?.answers);
  if (rows.length === 0) return { ok: false, kind: "unusable_response" };

  const byId = new Map(targets.map((question) => [question.id, question]));
  const answers: ModelAnswer[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const questionId = asString(record.questionId);
    if (!byId.has(questionId)) continue;

    const answer = asString(record.answer).trim();
    if (!answer) continue; // the model declined; better than a guess

    answers.push({
      questionId,
      answer,
      keyPoints: asArray(record.keyPoints)
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
        .slice(0, 5),
    });
  }

  return answers.length > 0
    ? { ok: true, answers }
    : { ok: false, kind: "unusable_response" };
}
