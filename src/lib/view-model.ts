import type {
  Answer,
  AnswerMapping,
  AssessmentResult,
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
  /** Distinct answer-sheet pages this answer occupies, ascending. */
  pages: number[];
  isMultiPage: boolean;
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
        pages,
        isMultiPage: pages.length > 1,
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
