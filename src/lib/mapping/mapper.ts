import type {
  Answer,
  AnswerMapping,
  ConfidenceBand,
  Degradation,
  MappingMethod,
  Question,
} from "@/lib/types/assessment";
import {
  describeDegradation,
  type EmbeddingProvider,
  type ReasoningProvider,
} from "@/lib/ai/provider";
import { MAPPING_SYSTEM } from "@/lib/ai/prompts";
import { asArray, asConfidence, asString, extractJson } from "@/lib/ai/json";
import { runDeterministicMatching } from "./deterministic";
import { buildSimilarityMatrix } from "./semantic";

/**
 * The mapping stage, ordered cheapest-and-most-certain first:
 *
 *   1. explicit label  -> deterministic
 *   2. fuzzy label     -> deterministic
 *   3. structural order-> deterministic
 *   4. semantic similarity (embeddings, or local TF-IDF)
 *   5. LLM reasoning, only for what is still ambiguous
 *
 * Later steps may only fill gaps left by earlier ones. A model is never given
 * the opportunity to overturn an explicit label the student actually wrote.
 */

/** Accept a semantic-only match above this; below it the answer stays loose. */
const SEMANTIC_ACCEPT = 0.34;
/** A semantic match must beat the runner-up by this margin to be trusted. */
const SEMANTIC_MARGIN = 0.06;

const HIGH_BAND = 0.85;
const MEDIUM_BAND = 0.6;
/** Below this the mapping is shown as needing review, whatever the method. */
const REVIEW_THRESHOLD = 0.75;
/** Answer transcriptions below this force a review flag regardless of match. */
const OCR_REVIEW_THRESHOLD = 0.5;

export type MappingResult = {
  mappings: AnswerMapping[];
  unmatchedAnswerIds: string[];
  similarityMethod: "embedding" | "lexical" | "none";
  /** Optional AI steps that could not run during matching, and why. */
  degradations: Degradation[];
};

export function toBand(confidence: number): ConfidenceBand {
  if (confidence <= 0) return "none";
  if (confidence >= HIGH_BAND) return "high";
  if (confidence >= MEDIUM_BAND) return "medium";
  return "low";
}

type Working = {
  questionId: string;
  answerId: string;
  confidence: number;
  methods: MappingMethod[];
  reasons: string[];
};

function upsert(
  store: Map<string, Working>,
  entry: Working,
): void {
  const existing = store.get(entry.questionId);
  if (!existing) {
    store.set(entry.questionId, entry);
    return;
  }
  // Same answer reached by another signal: corroboration raises confidence.
  if (existing.answerId === entry.answerId) {
    existing.confidence = Math.min(
      0.99,
      Math.max(existing.confidence, entry.confidence) +
        Math.min(existing.confidence, entry.confidence) * 0.15,
    );
    for (const method of entry.methods) {
      if (!existing.methods.includes(method)) existing.methods.push(method);
    }
    existing.reasons.push(...entry.reasons);
  }
}

export async function mapAnswersToQuestions(
  questions: Question[],
  answers: Answer[],
  providers: {
    embeddings: EmbeddingProvider | null;
    reasoning: ReasoningProvider | null;
  },
): Promise<MappingResult> {
  const store = new Map<string, Working>();
  const usedAnswers = new Set<string>();

  /* ---------------------------- Steps 1-3 ---------------------------- */

  const deterministic = runDeterministicMatching(questions, answers);
  for (const match of deterministic.matches) {
    upsert(store, {
      questionId: match.questionId,
      answerId: match.answerId,
      confidence: match.confidence,
      methods: [match.method],
      reasons: [match.reason],
    });
  }
  // upsert() only claims a question slot that is still free, so derive the
  // consumed answers from what actually landed in the store.
  for (const working of store.values()) usedAnswers.add(working.answerId);

  /**
   * An answer whose written label matches no question on the paper — the
   * student answering "18" on a paper numbered 1-14 — is positive evidence
   * that it belongs to no question here. Fuzzy matching already had its
   * chance to repair an OCR slip; anything still stray is withheld from the
   * similarity and reasoning steps so a weak content overlap cannot quietly
   * attach it to an unrelated question. It surfaces as an unmatched answer.
   */
  const strayLabelled = new Set(
    deterministic.strayLabelledAnswerIds.filter((id) => !usedAnswers.has(id)),
  );
  const eligible = (answer: Answer) =>
    !usedAnswers.has(answer.id) && !strayLabelled.has(answer.id);

  /* ------------------------------ Step 4 ----------------------------- */

  const openQuestions = questions.filter((question) => !store.has(question.id));
  const openAnswers = answers.filter(eligible);

  let similarityMethod: MappingResult["similarityMethod"] = "none";
  const degradations: Degradation[] = [];

  if (openQuestions.length > 0 && openAnswers.length > 0) {
    const matrix = await buildSimilarityMatrix(
      openAnswers.map((answer) => answer.text),
      openQuestions.map((question) => `${question.text}`),
      providers.embeddings,
    );
    similarityMethod = matrix.method;
    if (matrix.degradedBecause) {
      degradations.push({
        step: "semantic-matching",
        kind: matrix.degradedBecause,
        message: describeDegradation(
          matrix.degradedBecause,
          "AI similarity matching fell back to local text matching, which",
        ).replace(" was skipped", " was used instead"),
      });
    }

    // Greedy best-first over the whole score matrix so the strongest pair wins
    // globally rather than whichever answer happens to be processed first.
    type Candidate = {
      answerIndex: number;
      questionIndex: number;
      score: number;
      margin: number;
    };
    const candidates: Candidate[] = [];

    matrix.scores.forEach((row, answerIndex) => {
      const ranked = row
        .map((score, questionIndex) => ({ score, questionIndex }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best || best.score < SEMANTIC_ACCEPT) return;
      const runnerUp = ranked[1]?.score ?? 0;
      candidates.push({
        answerIndex,
        questionIndex: best.questionIndex,
        score: best.score,
        margin: best.score - runnerUp,
      });
    });

    candidates.sort((a, b) => b.score - a.score);

    for (const candidate of candidates) {
      const question = openQuestions[candidate.questionIndex];
      const answer = openAnswers[candidate.answerIndex];
      if (!question || !answer) continue;
      if (store.has(question.id) || usedAnswers.has(answer.id)) continue;

      const decisive = candidate.margin >= SEMANTIC_MARGIN;
      // Similarity alone is weak evidence; cap it well below a label match so
      // the UI still surfaces these as "needs review".
      const confidence = Math.min(0.7, 0.42 + candidate.score * 0.4);

      store.set(question.id, {
        questionId: question.id,
        answerId: answer.id,
        confidence: decisive ? confidence : confidence * 0.85,
        methods: ["semantic_match"],
        reasons: [
          `Matched on content similarity (${matrix.method}, score ${candidate.score.toFixed(
            2,
          )})${decisive ? "" : "; another question scored almost as highly"}.`,
        ],
      });
      usedAnswers.add(answer.id);
    }
  }

  /* ------------------------------ Step 5 ----------------------------- */

  const stillOpenQuestions = questions.filter((question) => !store.has(question.id));
  const stillOpenAnswers = answers.filter(eligible);

  if (
    providers.reasoning &&
    stillOpenQuestions.length > 0 &&
    stillOpenAnswers.length > 0
  ) {
    const prompt = [
      "Unmatched questions:",
      ...stillOpenQuestions.map(
        (question) =>
          `- id=${question.id} label="${question.label}" text="${question.text.slice(0, 400)}"`,
      ),
      "",
      "Unmatched answers (handwriting OCR, may contain errors):",
      ...stillOpenAnswers.map(
        (answer) =>
          `- id=${answer.id} writtenLabel=${
            answer.recognizedLabel ? `"${answer.recognizedLabel}"` : "none"
          } text="${answer.text.slice(0, 600)}"`,
      ),
    ].join("\n");

    const response = await providers.reasoning.completeJson({
      system: MAPPING_SYSTEM,
      prompt,
      maxOutputTokens: 4096,
    });

    if (!response.ok) {
      degradations.push({
        step: "semantic-matching",
        kind: response.kind,
        message: describeDegradation(
          response.kind,
          "AI reasoning over the remaining ambiguous answers",
        ),
      });
    }

    const parsed = extractJson(
      JSON.stringify(response.ok ? response.value : null),
    );
    const rows = asArray(
      parsed && typeof parsed === "object" && "matches" in (parsed as object)
        ? (parsed as { matches: unknown }).matches
        : parsed,
    );

    const questionIds = new Set(stillOpenQuestions.map((question) => question.id));
    const answerIds = new Set(stillOpenAnswers.map((answer) => answer.id));

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const questionId = asString(record.questionId);
      const answerId = asString(record.answerId);
      // Reject anything referring to an already-decided pair; the model does
      // not get to revisit deterministic conclusions.
      if (!questionIds.has(questionId) || !answerIds.has(answerId)) continue;
      if (store.has(questionId) || usedAnswers.has(answerId)) continue;

      const confidence = Math.min(0.78, asConfidence(record.confidence, 0.5));
      const reason = asString(record.reason).trim();

      store.set(questionId, {
        questionId,
        answerId,
        confidence,
        methods: ["llm_reasoning"],
        reasons: [reason || "Matched by AI reasoning over the answer's content."],
      });
      usedAnswers.add(answerId);
    }
  }

  /* --------------------------- Final assembly ------------------------ */

  const answerById = new Map(answers.map((answer) => [answer.id, answer]));

  const mappings: AnswerMapping[] = questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const working = store.get(question.id);
      if (!working) {
        return {
          questionId: question.id,
          confidence: 0,
          band: "none" as ConfidenceBand,
          status: "unanswered" as const,
          methods: [],
          reasons: ["No handwritten answer could be linked to this question."],
        };
      }

      const answer = answerById.get(working.answerId);
      const ocrConfidence = answer?.confidence ?? 1;
      const reasons = [...working.reasons];

      let confidence = working.confidence;
      if (ocrConfidence < OCR_REVIEW_THRESHOLD) {
        // Reading the handwriting badly undermines any match built on it.
        confidence = Math.min(confidence, 0.6);
        reasons.push("The handwriting in this answer was difficult to read.");
      }
      if (answer?.regions && answer.regions.length > 1) {
        const pages = new Set(answer.regions.map((region) => region.pageNumber));
        if (pages.size > 1) {
          reasons.push(
            `This answer continues across pages ${[...pages].sort((a, b) => a - b).join(" and ")}.`,
          );
        }
      }

      const methods: MappingMethod[] = [...working.methods];
      if (answer && answer.regions.length > 1 && !methods.includes("continuation")) {
        methods.push("continuation");
      }

      return {
        questionId: question.id,
        answerId: working.answerId,
        confidence: Number(confidence.toFixed(3)),
        band: toBand(confidence),
        status: confidence < REVIEW_THRESHOLD ? "needs_review" : "matched",
        methods,
        reasons,
      } satisfies AnswerMapping;
    });

  const unmatchedAnswerIds = answers
    .filter((answer) => !usedAnswers.has(answer.id))
    .map((answer) => answer.id);

  return { mappings, unmatchedAnswerIds, similarityMethod, degradations };
}
