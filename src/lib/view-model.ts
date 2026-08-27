import type {
  Answer,
  AnswerMapping,
  AssessmentResult,
  ModelAnswer,
  Question,
  QuestionGrade,
} from "@/lib/types/assessment";

/**
 * Flattens the pipeline result into the rows the results screen renders.
 * Row order is always `question.order` — the printed order of the paper —
 * regardless of the order answers were written or the AI returned them.
 */

export type QuestionRow = {
  question: Question;
  mapping: AnswerMapping;
  answer?: Answer;
  grade?: QuestionGrade;
  /** Expected answer, present only when the question went unanswered. */
  modelAnswer?: ModelAnswer;
  /** Distinct answer-sheet pages this answer occupies, ascending. */
  pages: number[];
  isMultiPage: boolean;
  /** True when this question is a labelled sub-part of another. */
  isSubPart: boolean;
  /** Label of the parent question, e.g. "11" for "11 (b)". */
  parentLabel?: string;
  /** True when other entries share this question's parent. */
  hasSiblings: boolean;
};

export type FilterKey = "all" | "answered" | "unanswered" | "review";

export function buildQuestionRows(result: AssessmentResult): QuestionRow[] {
  const answerById = new Map(result.answers.map((answer) => [answer.id, answer]));
  const mappingByQuestion = new Map(
    result.mappings.map((mapping) => [mapping.questionId, mapping]),
  );
  const gradeByQuestion = new Map(
    (result.grades ?? []).map((grade) => [grade.questionId, grade]),
  );
  const modelAnswerByQuestion = new Map(
    (result.modelAnswers ?? []).map((entry) => [entry.questionId, entry]),
  );

  const questionById = new Map(result.questions.map((q) => [q.id, q]));
  const subPartCountByParent = new Map<string, number>();
  for (const question of result.questions) {
    if (!question.parentId) continue;
    subPartCountByParent.set(
      question.parentId,
      (subPartCountByParent.get(question.parentId) ?? 0) + 1,
    );
  }

  return [...result.questions]
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const mapping = mappingByQuestion.get(question.id) ?? {
        questionId: question.id,
        confidence: 0,
        band: "none" as const,
        status: "unanswered" as const,
        methods: [],
        reasons: ["No mapping was produced for this question."],
      };
      const answer = mapping.answerId ? answerById.get(mapping.answerId) : undefined;
      const pages = answer
        ? [...new Set(answer.regions.map((region) => region.pageNumber))].sort(
            (a, b) => a - b,
          )
        : [];

      return {
        question,
        mapping,
        answer,
        grade: gradeByQuestion.get(question.id),
        modelAnswer: modelAnswerByQuestion.get(question.id),
        pages,
        isMultiPage: pages.length > 1,
        isSubPart: Boolean(question.parentId),
        parentLabel: question.parentId
          ? questionById.get(question.parentId)?.label.replace(/[.:]$/, "")
          : undefined,
        hasSiblings: question.parentId
          ? (subPartCountByParent.get(question.parentId) ?? 0) > 1
          : (subPartCountByParent.get(question.id) ?? 0) > 0,
      } satisfies QuestionRow;
    });
}

export function filterRows(rows: QuestionRow[], filter: FilterKey): QuestionRow[] {
  switch (filter) {
    case "answered":
      return rows.filter((row) => row.mapping.status === "matched");
    case "unanswered":
      return rows.filter((row) => row.mapping.status === "unanswered");
    case "review":
      return rows.filter((row) => row.mapping.status === "needs_review");
    default:
      return rows;
  }
}

export function searchRows(rows: QuestionRow[], query: string): QuestionRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.question.label,
      row.question.text,
      row.question.section ?? "",
      row.answer?.text ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function unmatchedAnswers(result: AssessmentResult): Answer[] {
  const ids = new Set(result.unmatchedAnswerIds);
  return result.answers
    .filter((answer) => ids.has(answer.id))
    .sort((a, b) => a.order - b.order);
}

export function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
