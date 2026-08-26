import type { Answer, Question } from "@/lib/types/assessment";
import { parseLabel } from "./normalize-label";

/**
 * Deterministic matching. Everything here is explainable without reference to
 * a model: an explicit label the student wrote, a near-miss label that OCR
 * plausibly mangled, or the writing order between two confident anchors.
 *
 * These rules run first and their results are never overridden downstream.
 */

export type DeterministicMatch = {
  questionId: string;
  answerId: string;
  confidence: number;
  method: "explicit_label" | "fuzzy_label" | "structural_order";
  reason: string;
};

export type DeterministicResult = {
  matches: DeterministicMatch[];
  /** Answers whose written label matches no question at all. */
  strayLabelledAnswerIds: string[];
};

/** Levenshtein distance, capped for early exit on obviously distant strings. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Step 2 — exact label match on the canonical form.
 * A student writing "11(b)" for a paper containing "11 (b)" is the strongest
 * evidence available and is treated as such.
 */
function matchExplicitLabels(
  questions: Question[],
  answers: Answer[],
): { matches: DeterministicMatch[]; stray: string[] } {
  const byLabel = new Map<string, Question[]>();
  for (const question of questions) {
    const bucket = byLabel.get(question.normalizedLabel);
    if (bucket) bucket.push(question);
    else byLabel.set(question.normalizedLabel, [question]);
  }

  const matches: DeterministicMatch[] = [];
  const stray: string[] = [];
  const takenQuestions = new Set<string>();

  for (const answer of answers) {
    const normalized = answer.normalizedRecognizedLabel;
    if (!normalized) continue;

    const candidates = byLabel.get(normalized) ?? [];
    const available = candidates.filter((q) => !takenQuestions.has(q.id));

    if (available.length === 1) {
      matches.push({
        questionId: available[0].id,
        answerId: answer.id,
        confidence: 0.97,
        method: "explicit_label",
        reason: `The student wrote "${answer.recognizedLabel}", which matches question ${available[0].label}.`,
      });
      takenQuestions.add(available[0].id);
    } else if (available.length > 1) {
      // Duplicate labels on the paper: fall through to later signals.
      continue;
    } else if (candidates.length === 0) {
      stray.push(answer.id);
    }
  }

  return { matches, stray };
}

/**
 * Step 2b — fuzzy label match, for the OCR mistakes handwriting guarantees.
 *
 * Only a same-length substitution in the question number counts: "13" read as
 * "18" is the classic confusion, whereas turning "18" into "8" would invent a
 * digit and silently move the answer to a different question. Sub-parts must
 * agree exactly, since 11(a) and 11(b) are different questions, not typos of
 * each other. A repair is accepted only when exactly one question is close
 * enough, so an ambiguous smudge stays unmatched rather than guessed.
 */
function matchFuzzyLabels(
  questions: Question[],
  answers: Answer[],
  taken: Set<string>,
  matchedAnswers: Set<string>,
): DeterministicMatch[] {
  const matches: DeterministicMatch[] = [];

  for (const answer of answers) {
    if (matchedAnswers.has(answer.id)) continue;
    const normalized = answer.normalizedRecognizedLabel;
    if (!normalized) continue;

    const parsedAnswer = parseLabel(normalized);
    if (!parsedAnswer.main) continue;

    const candidates = questions
      .filter((question) => !taken.has(question.id))
      .filter((question) => {
        const parsedQuestion = parseLabel(question.normalizedLabel);
        if ((parsedAnswer.sub ?? null) !== (parsedQuestion.sub ?? null)) return false;
        if (parsedAnswer.main.length !== parsedQuestion.main.length) return false;
        return editDistance(parsedAnswer.main, parsedQuestion.main, 1) === 1;
      });

    if (candidates.length === 1) {
      const question = candidates[0];
      matches.push({
        questionId: question.id,
        answerId: answer.id,
        confidence: 0.72,
        method: "fuzzy_label",
        reason: `The written label "${answer.recognizedLabel}" is one digit away from question ${question.label}; handwriting OCR often confuses these.`,
      });
      taken.add(question.id);
      matchedAnswers.add(answer.id);
    }
  }

  return matches;
}

/**
 * Step 3 — structural order. For an unlabelled answer sitting between two
 * confidently matched answers, the only questions it can belong to are the
 * unanswered ones printed between those two anchors. When exactly one such
 * question exists, the writing order settles it.
 */
function matchStructuralOrder(
  questions: Question[],
  answers: Answer[],
  taken: Set<string>,
  matchedAnswers: Set<string>,
  anchorByAnswerId: Map<string, string>,
): DeterministicMatch[] {
  const questionOrder = new Map(questions.map((q) => [q.id, q.order]));
  const orderedAnswers = [...answers].sort((a, b) => a.order - b.order);
  const matches: DeterministicMatch[] = [];

  for (let i = 0; i < orderedAnswers.length; i += 1) {
    const answer = orderedAnswers[i];
    if (matchedAnswers.has(answer.id)) continue;
    if (answer.normalizedRecognizedLabel) continue; // labelled: handled above

    // Nearest matched answer before and after, in writing order.
    let lowerBound = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      const anchor = anchorByAnswerId.get(orderedAnswers[j].id);
      if (anchor !== undefined) {
        lowerBound = questionOrder.get(anchor) ?? -1;
        break;
      }
    }
    let upperBound = questions.length;
    for (let j = i + 1; j < orderedAnswers.length; j += 1) {
      const anchor = anchorByAnswerId.get(orderedAnswers[j].id);
      if (anchor !== undefined) {
        upperBound = questionOrder.get(anchor) ?? questions.length;
        break;
      }
    }

    const between = questions.filter(
      (question) =>
        !taken.has(question.id) &&
        question.order > lowerBound &&
        question.order < upperBound,
    );

    if (between.length === 1) {
      const question = between[0];
      matches.push({
        questionId: question.id,
        answerId: answer.id,
        confidence: 0.68,
        method: "structural_order",
        reason: `This unlabelled answer sits between answers to neighbouring questions, and question ${question.label} is the only one left in that range.`,
      });
      taken.add(question.id);
      matchedAnswers.add(answer.id);
      anchorByAnswerId.set(answer.id, question.id);
    }
  }

  return matches;
}

export function runDeterministicMatching(
  questions: Question[],
  answers: Answer[],
): DeterministicResult {
  const explicit = matchExplicitLabels(questions, answers);

  const taken = new Set(explicit.matches.map((match) => match.questionId));
  const matchedAnswers = new Set(explicit.matches.map((match) => match.answerId));
  const anchorByAnswerId = new Map(
    explicit.matches.map((match) => [match.answerId, match.questionId]),
  );

  const fuzzy = matchFuzzyLabels(questions, answers, taken, matchedAnswers);
  for (const match of fuzzy) anchorByAnswerId.set(match.answerId, match.questionId);

  const structural = matchStructuralOrder(
    questions,
    answers,
    taken,
    matchedAnswers,
    anchorByAnswerId,
  );

  return {
    matches: [...explicit.matches, ...fuzzy, ...structural],
    strayLabelledAnswerIds: explicit.stray.filter((id) => !matchedAnswers.has(id)),
  };
}
