import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildEvaluationPdf, reportFileName } from "@/lib/report-pdf";
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
    feedback: `Feedback for ${questionId}`,
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
        text: "An ecosystem is a community of organisms and their surroundings.",
        regions: [{ pageNumber: 1, bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } }],
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
    ],
    unmatchedAnswerIds: [],
    summary: {
      totalQuestions: 2,
      answered: 1,
      unanswered: 1,
      needsReview: 0,
      unmatchedAnswers: 0,
    },
    grades: [grade("q_1", 2, 2, "correct"), grade("q_2", 0, 3, "not_attempted")],
    gradingSummary: {
      marksObtained: 2,
      maxMarks: 5,
      percentage: 40,
      summary: "A promising start with gaps in the longer questions.",
      improvementAreas: [],
    },
    warnings: [],
    degradations: [],
  };
}

function makeResult(students: StudentResult[]): AssessmentResult {
  return {
    jobId: "job",
    questionPaper: {
      kind: "question-paper",
      fileName: "class-10-biology.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      pageCount: 1,
      pages: [],
    },
    questions: [
      {
        id: "q_1",
        label: "1",
        normalizedLabel: "1",
        text: "Define an ecosystem and name its two main components.",
        pageNumber: 1,
        order: 0,
        marks: 2,
      },
      {
        id: "q_2",
        label: "2",
        normalizedLabel: "2",
        text: "Explain the complete process of photosynthesis in green plants.",
        pageNumber: 1,
        order: 1,
        marks: 3,
      },
    ],
    students,
    warnings: [],
    degradations: [],
    provider: { id: "gemini", model: "test", degraded: false },
  };
}

/** Read a generated PDF back, which is the only reliable way to inspect it —
 *  pdf-lib compresses its streams, so the bytes are not greppable. */
async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return { pages: doc.getPageCount(), title: doc.getTitle() };
}

describe("buildEvaluationPdf", () => {
  it("produces a valid PDF for one student", async () => {
    const aryan = student("s_1", "Aryan Sharma");
    const bytes = await buildEvaluationPdf({
      result: makeResult([aryan]),
      edits: {},
      student: aryan,
    });

    expect(bytes.byteLength).toBeGreaterThan(1000);
    // %PDF- magic, so the file actually opens in a reader.
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");

    const { pages, title } = await inspect(bytes);
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(title).toBe("Evaluation report — Aryan Sharma");
  });

  it("carries the teacher's edited marks, not the AI's originals", async () => {
    const aryan = student("s_1", "Aryan Sharma");
    const result = makeResult([aryan]);

    const original = await buildEvaluationPdf({ result, edits: {}, student: aryan });
    const edited = await buildEvaluationPdf({
      result,
      edits: { s_1: { q_2: { marksObtained: 3 } } },
      student: aryan,
    });

    // Awarding the missing 3 marks changes the document, so the export cannot
    // be silently shipping the pre-review evaluation.
    expect(Buffer.from(edited).equals(Buffer.from(original))).toBe(false);
    expect(edited.byteLength).toBeGreaterThan(1000);
  });

  it("exports the whole class when no student is given", async () => {
    const result = makeResult([
      student("s_1", "Aryan Sharma"),
      student("s_2", "Meera Patel"),
      student("s_3", "Rohit Kumar"),
    ]);

    const one = await inspect(
      await buildEvaluationPdf({ result, edits: {}, student: result.students[0] }),
    );
    const all = await inspect(await buildEvaluationPdf({ result, edits: {} }));

    // Every student starts a fresh page, so a report can be handed out alone.
    expect(all.pages).toBeGreaterThanOrEqual(one.pages * 3);
    expect(all.title).toBe("Evaluation reports");
  });

  it("still produces a report when the student was never graded", async () => {
    const ungraded = {
      ...student("s_1", "Priya"),
      grades: undefined,
      gradingSummary: undefined,
    };
    const bytes = await buildEvaluationPdf({
      result: makeResult([ungraded]),
      edits: {},
      student: ungraded,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("survives content long enough to need extra pages", async () => {
    const wordy = student("s_1", "Aryan Sharma");
    wordy.answers[0].text = "A very long answer. ".repeat(400);
    const result = makeResult([wordy]);
    result.questions[0].text = "An unusually long question. ".repeat(60);

    const bytes = await buildEvaluationPdf({ result, edits: {}, student: wordy });
    const { pages } = await inspect(bytes);
    expect(pages).toBeGreaterThan(1);
  });

  it("does not break on a word wider than the page", async () => {
    const odd = student("s_1", "Aryan Sharma");
    const result = makeResult([odd]);
    result.questions[0].text = "x".repeat(500);
    await expect(
      buildEvaluationPdf({ result, edits: {}, student: odd }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("reportFileName", () => {
  it("names the file after the student, safely", () => {
    expect(reportFileName(student("s_1", "Aryan Sharma"))).toBe(
      "evaluation-report-Aryan-Sharma.pdf",
    );
    expect(reportFileName(student("s_2", "O'Brien / Smith"))).toBe(
      "evaluation-report-OBrien-Smith.pdf",
    );
  });

  it("uses a class-wide name when exporting everyone", () => {
    expect(reportFileName(undefined)).toBe("evaluation-reports.pdf");
  });
});
