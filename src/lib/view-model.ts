import type {
  Answer,
  AnswerMapping,
  AssessmentResult,
  Evaluation,
  GradingSummary,
  ModelAnswer,
  Question,
  QuestionGrade,
  ReviewEdit,
  ReviewEdits,
  StudentResult,
} from "@/lib/types/assessment";

/**
 * Flattens one student's evaluation into the rows the report renders.
 *
 * Row order is always `question.order` — the printed order of the paper —
 * regardless of the order answers were written or the AI returned them, and
 * regardless of which student is selected.
 */

export type QuestionRow = {
  question: Question;
  mapping: AnswerMapping;
  answer?: Answer;
  /** The grade in force: the teacher's edit if there is one, else the AI's. */
  grade?: QuestionGrade;
  /** The AI's original, kept so an edit can be shown and reverted. */
  originalGrade?: QuestionGrade;
  /** True when a teacher changed the marks or the feedback. */
  isEdited: boolean;
  modelAnswer?: ModelAnswer;
  /** Distinct answer-sheet pages this answer occupies, ascending. */
  pages: number[];
  isMultiPage: boolean;
  /** True when this question is a labelled sub-part of another. */
  isSubPart: boolean;
  /** Label of the parent question, e.g. "11" for "11 (b)". */
  parentLabel?: string;
  hasSiblings: boolean;
};

export type FilterKey = "all" | "answered" | "unanswered" | "review" | "edited";

const DEFAULT_MAX_MARKS = 1;

/** Apply a teacher's edit on top of the AI's grade for one question. */
function applyEdit(
  base: QuestionGrade | undefined,
  edit: ReviewEdit | undefined,
  question: Question,
): { grade?: QuestionGrade; edited: boolean } {
  if (!edit || (edit.marksObtained === undefined && edit.feedback === undefined)) {
    return { grade: base, edited: false };
  }

  const maxMarks = base?.maxMarks ?? question.marks ?? DEFAULT_MAX_MARKS;
  const marksObtained =
    edit.marksObtained !== undefined
      ? Math.min(maxMarks, Math.max(0, edit.marksObtained))
      : (base?.marksObtained ?? 0);

  // The verdict follows the marks the teacher actually awarded, so a card can
  // never read "Incorrect" next to full marks.
  const evaluation: Evaluation =
    marksObtained >= maxMarks
      ? "correct"
      : marksObtained > 0
        ? "partial"
        : (base?.evaluation ?? "incorrect") === "not_attempted"
          ? "not_attempted"
          : "incorrect";

  return {
    grade: {
      questionId: question.id,
      marksObtained,
      maxMarks,
      evaluation,
      feedback: edit.feedback ?? base?.feedback ?? "",
      confidence: 1,
      // A teacher has looked at it, so it no longer needs review.
      requiresReview: false,
    },
    edited: true,
  };
}

export function buildQuestionRows(
  result: AssessmentResult,
  student: StudentResult | undefined,
  edits: Record<string, ReviewEdit> = {},
): QuestionRow[] {
  if (!student) return [];

  const answerById = new Map(student.answers.map((answer) => [answer.id, answer]));
  const mappingByQuestion = new Map(
    student.mappings.map((mapping) => [mapping.questionId, mapping]),
  );
  const gradeByQuestion = new Map(
    (student.grades ?? []).map((grade) => [grade.questionId, grade]),
  );
  const modelAnswerByQuestion = new Map(
    (student.modelAnswers ?? []).map((entry) => [entry.questionId, entry]),
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

      const original = gradeByQuestion.get(question.id);
      const { grade, edited } = applyEdit(original, edits[question.id], question);

      return {
        question,
        mapping,
        answer,
        grade,
        originalGrade: original,
        isEdited: edited,
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

/**
 * Recompute the score from whatever grades are actually in force.
 *
 * The published total has to follow the teacher's edits, not the AI's original
 * marks — otherwise the report and the header disagree the moment anything is
 * corrected.
 */
export function summariseGrades(
  rows: QuestionRow[],
  base: GradingSummary | undefined,
): GradingSummary | undefined {
  const graded = rows.filter((row) => row.grade);
  if (graded.length === 0) return undefined;

  const marksObtained = graded.reduce((sum, row) => sum + row.grade!.marksObtained, 0);
  const maxMarks = graded.reduce((sum, row) => sum + row.grade!.maxMarks, 0);

  return {
    marksObtained,
    maxMarks,
    percentage: maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0,
    summary: base?.summary ?? "",
    improvementAreas: base?.improvementAreas ?? [],
  };
}

/** Letter grade for the score band, shown beside the percentage. */
export function gradeBand(percentage: number): { letter: string; label: string } {
  if (percentage >= 90) return { letter: "A+", label: "Outstanding" };
  if (percentage >= 80) return { letter: "A", label: "Excellent" };
  if (percentage >= 70) return { letter: "B", label: "Good" };
  if (percentage >= 60) return { letter: "C", label: "Fair" };
  if (percentage >= 40) return { letter: "D", label: "Needs work" };
  return { letter: "E", label: "Needs support" };
}

/**
 * What the student did well, derived from the grades actually awarded rather
 * than asked of the model separately — so it always agrees with the marks on
 * screen, including after a teacher edits them.
 */
export function strengthsFrom(rows: QuestionRow[]): string[] {
  return rows
    .filter((row) => row.grade && row.grade.evaluation === "correct")
    .slice(0, 4)
    .map(
      (row) =>
        `${row.question.label.replace(/[.:]$/, "")} — ${row.question.text.slice(0, 90)}`,
    );
}

export function improvementsFrom(
  rows: QuestionRow[],
  base: GradingSummary | undefined,
): string[] {
  const fromGrades = rows
    .filter(
      (row) =>
        row.grade &&
        (row.grade.evaluation === "incorrect" ||
          row.grade.evaluation === "partial" ||
          row.grade.evaluation === "not_attempted"),
    )
    .slice(0, 4)
    .map(
      (row) =>
        `${row.question.label.replace(/[.:]$/, "")} — ${row.question.text.slice(0, 90)}`,
    );
  return fromGrades.length > 0 ? fromGrades : (base?.improvementAreas ?? []);
}

export function filterRows(rows: QuestionRow[], filter: FilterKey): QuestionRow[] {
  switch (filter) {
    case "answered":
      return rows.filter((row) => row.mapping.status === "matched");
    case "unanswered":
      return rows.filter((row) => row.mapping.status === "unanswered");
    case "review":
      return rows.filter((row) => row.mapping.status === "needs_review");
    case "edited":
      return rows.filter((row) => row.isEdited);
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
      row.grade?.feedback ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function unmatchedAnswers(student: StudentResult | undefined): Answer[] {
  if (!student) return [];
  const ids = new Set(student.unmatchedAnswerIds);
  return student.answers
    .filter((answer) => ids.has(answer.id))
    .sort((a, b) => a.order - b.order);
}

export function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** True when any student has a teacher edit recorded. */
export function hasAnyEdits(edits: ReviewEdits): boolean {
  return Object.values(edits).some((byQuestion) =>
    Object.values(byQuestion).some(
      (edit) => edit.marksObtained !== undefined || edit.feedback !== undefined,
    ),
  );
}
