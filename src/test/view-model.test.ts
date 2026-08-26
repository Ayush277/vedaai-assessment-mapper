import { describe, expect, it } from "vitest";
import { buildQuestionRows, filterRows, searchRows } from "@/lib/view-model";
import type { AssessmentResult } from "@/lib/types/assessment";

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
    answerSheet: {
      kind: "answer-sheet",
      fileName: "sheet.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      pageCount: 4,
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
      },
      {
        id: "q_1",
        label: "1",
        normalizedLabel: "1",
        text: "Define an ecosystem.",
        pageNumber: 1,
        order: 0,
      },
      {
        id: "q_3",
        label: "3",
        normalizedLabel: "3",
        text: "Explain photosynthesis.",
        pageNumber: 1,
        order: 2,
      },
    ],
    answers: [
      {
        id: "a_1",
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
        answerId: "a_1",
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
    warnings: [],
    provider: { id: "gemini", model: "test", degraded: false },
  };
}

describe("buildQuestionRows", () => {
  it("always renders in printed order, never in answer or AI order", () => {
    const rows = buildQuestionRows(makeResult());
    expect(rows.map((row) => row.question.id)).toEqual(["q_1", "q_2", "q_3"]);
  });

  it("collects the distinct pages a multi-page answer occupies", () => {
    const rows = buildQuestionRows(makeResult());
    expect(rows[0].pages).toEqual([3, 4]);
    expect(rows[0].isMultiPage).toBe(true);
  });

  it("leaves an unanswered row without an answer object", () => {
    const rows = buildQuestionRows(makeResult());
    expect(rows[1].answer).toBeUndefined();
    expect(rows[1].pages).toEqual([]);
  });
});

describe("filterRows", () => {
  it("filters by mapping status", () => {
    const rows = buildQuestionRows(makeResult());
    expect(filterRows(rows, "answered").map((r) => r.question.id)).toEqual(["q_1"]);
    expect(filterRows(rows, "unanswered").map((r) => r.question.id)).toEqual(["q_2"]);
    expect(filterRows(rows, "review").map((r) => r.question.id)).toEqual(["q_3"]);
    expect(filterRows(rows, "all")).toHaveLength(3);
  });
});

describe("searchRows", () => {
  it("matches question text, labels and answer text", () => {
    const rows = buildQuestionRows(makeResult());
    expect(searchRows(rows, "newton").map((r) => r.question.id)).toEqual(["q_2"]);
    expect(searchRows(rows, "community").map((r) => r.question.id)).toEqual(["q_1"]);
    expect(searchRows(rows, "  ")).toHaveLength(3);
  });
});
