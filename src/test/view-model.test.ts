import { describe, expect, it } from "vitest";
import {
  buildQuestionRows,
  filterRows,
  gradeBand,
  hasAnyEdits,
  improvementsFrom,
  searchRows,
  strengthsFrom,
  summariseGrades,
  unmatchedAnswers,
} from "@/lib/view-model";
import type {
  AssessmentResult,
  QuestionGrade,
  StudentResult,
} from "@/lib/types/assessment";

function grade(
  questionId: string,
  marksObtained: number,
  maxMarks: number,
  evaluation: QuestionGrade["evaluation"],
): QuestionGrade {
  return {
    questionId,
    marksObtained,
    maxMarks,
    evaluation,
    feedback: `AI feedback for ${questionId}`,
    confidence: 0.8,
    requiresReview: false,
  };
}

function student(id: string, name: string): StudentResult {
  return {
    id,
    name,
    fileName: `${name}.pdf`,
    answerSheet: {
      kind: "answer-sheet",
      fileName: `${name}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1,
      pageCount: 1,
      pages: [],
    },
    answers: [
      {
        id: `${id}_a1`,
        text: "An ecosystem is a community of organisms.",
        regions: [
          { pageNumber: 3, bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } },
          { pageNumber: 4, bbox: { x: 0.1, y: 0.05, width: 0.5, height: 0.1 } },
        ],
        confidence: 0.9,
        appearsIncomplete: false,
        order: 0,
      },
    ],
    mappings: [
      {
        questionId: "q_1",
        answerId: `${id}_a1`,
        confidence: 0.97,
        band: "high",
        status: "matched",
        methods: ["explicit_label"],
        reasons: [],
      },
      {
        questionId: "q_2",
        confidence: 0,
        band: "none",
        status: "unanswered",
        methods: [],
        reasons: [],
      },
      {
        questionId: "q_3",
        confidence: 0.55,
        band: "low",
        status: "needs_review",
        methods: ["semantic_match"],
        reasons: [],
      },
    ],
    unmatchedAnswerIds: [],
    summary: {
      totalQuestions: 3,
      answered: 1,
      unanswered: 1,
      needsReview: 1,
      unmatchedAnswers: 0,
    },
    grades: [
      grade("q_1", 2, 2, "correct"),
      grade("q_2", 0, 3, "not_attempted"),
      grade("q_3", 1, 3, "partial"),
    ],
    gradingSummary: {
      marksObtained: 3,
      maxMarks: 8,
      percentage: 38,
      summary: "Overall summary.",
      improvementAreas: ["from the model"],
    },
    warnings: [],
    degradations: [],
  };
}

function makeResult(): AssessmentResult {
  return {
    jobId: "job",
    questionPaper: {
      kind: "question-paper",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      pageCount: 1,
      pages: [],
    },
    // Deliberately out of printed order to prove the view model re-sorts.
    questions: [
      {
        id: "q_2",
        label: "2",
        normalizedLabel: "2",
        text: "State Newton's first law.",
        pageNumber: 1,
        order: 1,
        marks: 3,
      },
      {
        id: "q_1",
        label: "1",
        normalizedLabel: "1",
        text: "Define an ecosystem.",
        pageNumber: 1,
        order: 0,
        marks: 2,
      },
      {
        id: "q_3",
        label: "3",
        normalizedLabel: "3",
        text: "Explain photosynthesis.",
        pageNumber: 1,
        order: 2,
        marks: 3,
      },
    ],
    students: [student("s_1", "Aryan Sharma"), student("s_2", "Meera Patel")],
    warnings: [],
    degradations: [],
    provider: { id: "gemini", model: "test", degraded: false },
  };
}

describe("buildQuestionRows", () => {
  it("always renders in printed order, never in answer or AI order", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0]);
    expect(rows.map((row) => row.question.id)).toEqual(["q_1", "q_2", "q_3"]);
  });

  it("collects the distinct pages a multi-page answer occupies", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0]);
    expect(rows[0].pages).toEqual([3, 4]);
    expect(rows[0].isMultiPage).toBe(true);
  });

  it("returns nothing when no student is selected", () => {
    expect(buildQuestionRows(makeResult(), undefined)).toEqual([]);
  });

  it("reads each student independently from the same question list", () => {
    const result = makeResult();
    const a = buildQuestionRows(result, result.students[0]);
    const b = buildQuestionRows(result, result.students[1]);
    expect(a.map((r) => r.question.id)).toEqual(b.map((r) => r.question.id));
    expect(a[0].answer?.id).toBe("s_1_a1");
    expect(b[0].answer?.id).toBe("s_2_a1");
  });
});

describe("teacher edits", () => {
  it("overrides the AI's marks while keeping the original for comparison", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], {
      q_3: { marksObtained: 3 },
    });
    const edited = rows.find((row) => row.question.id === "q_3")!;

    expect(edited.grade?.marksObtained).toBe(3);
    expect(edited.originalGrade?.marksObtained).toBe(1);
    expect(edited.isEdited).toBe(true);
  });

  it("moves the verdict to match the marks the teacher awarded", () => {
    const result = makeResult();
    const full = buildQuestionRows(result, result.students[0], {
      q_3: { marksObtained: 3 },
    }).find((r) => r.question.id === "q_3");
    expect(full?.grade?.evaluation).toBe("correct");

    const none = buildQuestionRows(result, result.students[0], {
      q_1: { marksObtained: 0 },
    }).find((r) => r.question.id === "q_1");
    expect(none?.grade?.evaluation).toBe("incorrect");
  });

  it("never lets an edit exceed the maximum or go negative", () => {
    const result = makeResult();
    const over = buildQuestionRows(result, result.students[0], {
      q_1: { marksObtained: 99 },
    }).find((r) => r.question.id === "q_1");
    expect(over?.grade?.marksObtained).toBe(2);

    const under = buildQuestionRows(result, result.students[0], {
      q_1: { marksObtained: -5 },
    }).find((r) => r.question.id === "q_1");
    expect(under?.grade?.marksObtained).toBe(0);
  });

  it("clears the review flag once a teacher has looked at it", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], {
      q_3: { feedback: "Checked by hand." },
    });
    const edited = rows.find((r) => r.question.id === "q_3")!;
    expect(edited.grade?.requiresReview).toBe(false);
    expect(edited.grade?.feedback).toBe("Checked by hand.");
  });

  it("treats an empty edit as no edit at all", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], { q_1: {} });
    expect(rows.find((r) => r.question.id === "q_1")?.isEdited).toBe(false);
  });
});

describe("summariseGrades", () => {
  it("totals the AI's marks when nothing was edited", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0]);
    expect(summariseGrades(rows, result.students[0].gradingSummary)).toMatchObject({
      marksObtained: 3,
      maxMarks: 8,
      percentage: 38,
    });
  });

  it("follows the teacher's edits so the score cannot disagree with the questions", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], {
      q_3: { marksObtained: 3 },
      q_2: { marksObtained: 3 },
    });
    expect(summariseGrades(rows, result.students[0].gradingSummary)).toMatchObject({
      marksObtained: 8,
      maxMarks: 8,
      percentage: 100,
    });
  });

  it("returns nothing when the student was never graded", () => {
    const result = makeResult();
    const ungraded = { ...result.students[0], grades: undefined };
    const rows = buildQuestionRows(result, ungraded);
    expect(summariseGrades(rows, undefined)).toBeUndefined();
  });
});

describe("gradeBand", () => {
  it("maps a percentage onto a letter and a label", () => {
    expect(gradeBand(95).letter).toBe("A+");
    expect(gradeBand(84)).toEqual({ letter: "A", label: "Excellent" });
    expect(gradeBand(72).letter).toBe("B");
    expect(gradeBand(10).letter).toBe("E");
  });
});

describe("strengths and improvements", () => {
  it("derives both from the grades in force, not from a separate model call", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0]);
    expect(strengthsFrom(rows)[0]).toContain("1");
    expect(improvementsFrom(rows, result.students[0].gradingSummary).join(" ")).toContain("2");
  });

  it("moves a question out of improvements once the teacher awards full marks", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], {
      q_2: { marksObtained: 3 },
      q_3: { marksObtained: 3 },
    });
    expect(strengthsFrom(rows)).toHaveLength(3);
    expect(improvementsFrom(rows, undefined)).toHaveLength(0);
  });
});

describe("filterRows", () => {
  it("filters by mapping status and by edited state", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0], {
      q_3: { marksObtained: 3 },
    });
    expect(filterRows(rows, "answered").map((r) => r.question.id)).toEqual(["q_1"]);
    expect(filterRows(rows, "unanswered").map((r) => r.question.id)).toEqual(["q_2"]);
    expect(filterRows(rows, "review").map((r) => r.question.id)).toEqual(["q_3"]);
    expect(filterRows(rows, "edited").map((r) => r.question.id)).toEqual(["q_3"]);
    expect(filterRows(rows, "all")).toHaveLength(3);
  });
});

describe("searchRows", () => {
  it("matches question text, labels, answer text and feedback", () => {
    const result = makeResult();
    const rows = buildQuestionRows(result, result.students[0]);
    expect(searchRows(rows, "newton").map((r) => r.question.id)).toEqual(["q_2"]);
    expect(searchRows(rows, "community").map((r) => r.question.id)).toEqual(["q_1"]);
    expect(searchRows(rows, "  ")).toHaveLength(3);
  });
});

describe("unmatchedAnswers", () => {
  it("is empty when no student is selected", () => {
    expect(unmatchedAnswers(undefined)).toEqual([]);
  });
});

describe("hasAnyEdits", () => {
  it("ignores empty records and empty edits", () => {
    expect(hasAnyEdits({})).toBe(false);
    expect(hasAnyEdits({ s_1: {} })).toBe(false);
    expect(hasAnyEdits({ s_1: { q_1: {} } })).toBe(false);
    expect(hasAnyEdits({ s_1: { q_1: { marksObtained: 2 } } })).toBe(true);
    expect(hasAnyEdits({ s_1: { q_1: { feedback: "x" } } })).toBe(true);
  });
});
