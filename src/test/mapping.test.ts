import { describe, expect, it } from "vitest";
import { mapAnswersToQuestions } from "@/lib/mapping/mapper";
import type { Answer, Question } from "@/lib/types/assessment";

function question(label: string, order: number, text: string, marks?: number): Question {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    id: `q_${normalized}`,
    label,
    normalizedLabel: normalized,
    text,
    pageNumber: 1,
    order,
    marks,
  };
}

function answer(
  id: string,
  order: number,
  text: string,
  recognizedLabel?: string,
  pages: number[] = [1],
): Answer {
  return {
    id,
    order,
    text,
    recognizedLabel,
    normalizedRecognizedLabel: recognizedLabel
      ? recognizedLabel.toLowerCase().replace(/[^a-z0-9]/g, "")
      : undefined,
    regions: pages.map((pageNumber, index) => ({
      pageNumber,
      bbox: { x: 0.1, y: 0.1 + index * 0.3, width: 0.8, height: 0.25 },
    })),
    confidence: 0.9,
    appearsIncomplete: false,
  };
}

const noProviders = { embeddings: null, reasoning: null };

describe("mapAnswersToQuestions", () => {
  it("maps answers written out of order back to the printed question order", async () => {
    const questions = [
      question("1", 0, "Define an ecosystem."),
      question("2", 1, "State Newton's first law."),
      question("3", 2, "Explain photosynthesis."),
      question("4", 3, "Describe the water cycle."),
      question("5", 4, "What is osmosis?"),
    ];
    // Student answered 1, 3, 5, then 2. Question 4 was skipped entirely.
    const answers = [
      answer("a_1", 0, "An ecosystem is a community of organisms.", "1"),
      answer("a_2", 1, "Photosynthesis converts light into chemical energy.", "3"),
      answer("a_3", 2, "Osmosis is the movement of water across a membrane.", "5"),
      answer("a_4", 3, "An object stays at rest unless acted on by a force.", "2"),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    // Output order always follows the question paper, never the answer sheet.
    expect(mappings.map((mapping) => mapping.questionId)).toEqual([
      "q_1",
      "q_2",
      "q_3",
      "q_4",
      "q_5",
    ]);
    expect(mappings[0].answerId).toBe("a_1");
    expect(mappings[1].answerId).toBe("a_4");
    expect(mappings[2].answerId).toBe("a_2");
    expect(mappings[3].status).toBe("unanswered");
    expect(mappings[3].answerId).toBeUndefined();
    expect(mappings[4].answerId).toBe("a_3");
  });

  it("marks a question with no answer as unanswered without inventing one", async () => {
    const questions = [
      question("1", 0, "Define an ecosystem."),
      question("2", 1, "State Newton's first law."),
    ];
    const answers = [answer("a_1", 0, "An ecosystem is a community.", "1")];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings[1].status).toBe("unanswered");
    expect(mappings[1].answerId).toBeUndefined();
    expect(mappings[1].confidence).toBe(0);
  });

  it("keeps an answer labelled with a question that does not exist as unmatched", async () => {
    const questions = [
      question("1", 0, "Define an ecosystem."),
      question("2", 1, "State Newton's first law."),
    ];
    const answers = [
      answer("a_1", 0, "An ecosystem is a community of organisms.", "1"),
      answer("a_2", 1, "Some completely unrelated writing about cricket.", "19"),
    ];

    const { mappings, unmatchedAnswerIds } = await mapAnswersToQuestions(
      questions,
      answers,
      noProviders,
    );

    expect(unmatchedAnswerIds).toContain("a_2");
    // The unmatched answer must not be silently attached to question 2.
    expect(mappings[1].answerId).not.toBe("a_2");
  });

  it("does not let content similarity absorb an answer labelled for a missing question", async () => {
    const questions = [
      question("1", 0, "Define an ecosystem and name its two main components."),
      question("8", 1, "What is osmosis? Give one example from plant cells."),
    ];
    const answers = [
      answer("a_1", 0, "An ecosystem is a community of organisms.", "1"),
      // Labelled 18, which does not exist. It shares vocabulary with question
      // 8 ("cell"), which is exactly how a weak semantic match sneaks in.
      answer(
        "a_2",
        1,
        "The mitochondria is called the powerhouse of the cell because it releases energy for the cell.",
        "18",
      ),
    ];

    const { mappings, unmatchedAnswerIds } = await mapAnswersToQuestions(
      questions,
      answers,
      noProviders,
    );

    expect(unmatchedAnswerIds).toEqual(["a_2"]);
    expect(mappings.find((m) => m.questionId === "q_8")?.status).toBe("unanswered");
    expect(mappings.find((m) => m.questionId === "q_8")?.answerId).toBeUndefined();
  });

  it("still lets fuzzy label repair rescue a near-miss before declaring it stray", async () => {
    const questions = [question("13", 0, "Explain the carbon cycle in detail.")];
    const answers = [answer("a_1", 0, "The carbon cycle moves carbon around.", "18")];

    const { mappings, unmatchedAnswerIds } = await mapAnswersToQuestions(
      questions,
      answers,
      noProviders,
    );

    expect(unmatchedAnswerIds).toEqual([]);
    expect(mappings[0].answerId).toBe("a_1");
  });

  it("does not let a bracket lost by OCR hand a sub-part answer to its parent", async () => {
    // The real failure this guards: OCR read "11 (b)" as "11 (b", which
    // collapsed to "11". The parent stem then looked confidently answered while
    // both actual sub-parts read as unanswered.
    const questions = [
      question("11", 0, "Answer both parts of this question."),
      question("11(a)", 1, "Explain the process of normalization in databases."),
      question("11(b)", 2, "Give one example of a table in second normal form."),
    ];
    const answers = [
      answer("a_1", 0, "A student table with roll no as the key is in 2NF.", "11 (b"),
      answer("a_2", 1, "Normalization organises the columns and tables.", "11 (a"),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings.find((m) => m.questionId === "q_11b")?.answerId).toBe("a_1");
    expect(mappings.find((m) => m.questionId === "q_11a")?.answerId).toBe("a_2");
    // The stem itself has no answer of its own.
    expect(mappings.find((m) => m.questionId === "q_11")?.status).toBe("unanswered");
  });

  it("does not treat a different sub-part as a typo of its sibling", async () => {
    const questions = [
      question("11(a)", 0, "Explain the process of normalization."),
      question("11(b)", 1, "Give an example of a normalized table."),
    ];
    // Only 11(b) was answered; 11(a) must not absorb it as a one-character slip.
    const answers = [answer("a_1", 0, "A table with one fact per row.", "11(b)")];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings.find((m) => m.questionId === "q_11b")?.answerId).toBe("a_1");
    expect(mappings.find((m) => m.questionId === "q_11a")?.status).toBe("unanswered");
  });

  it("does not invent a digit to reach a question number", async () => {
    // "18" -> "8" would require inventing a leading digit; that is not a typo.
    const questions = [question("8", 0, "What is osmosis? Give one example.")];
    const answers = [answer("a_1", 0, "The mitochondria releases energy.", "18")];

    const { mappings, unmatchedAnswerIds } = await mapAnswersToQuestions(
      questions,
      answers,
      noProviders,
    );

    expect(unmatchedAnswerIds).toEqual(["a_1"]);
    expect(mappings[0].status).toBe("unanswered");
  });

  it("resolves sub-parts independently of their parent question", async () => {
    const questions = [
      question("11", 0, "Answer both parts below."),
      question("11(a)", 1, "Explain the process of normalization."),
      question("11(b)", 2, "Give an example of a normalized table."),
    ];
    const answers = [
      answer("a_1", 0, "Normalization removes redundancy.", "11(a)"),
      answer("a_2", 1, "A table with one fact per row.", "11(b)"),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings.find((m) => m.questionId === "q_11a")?.answerId).toBe("a_1");
    expect(mappings.find((m) => m.questionId === "q_11b")?.answerId).toBe("a_2");
    expect(mappings.find((m) => m.questionId === "q_11")?.status).toBe("unanswered");
  });

  it("reports a multi-page answer as one mapping and says so in the reasons", async () => {
    const questions = [question("7", 0, "Explain photosynthesis in detail.")];
    const answers = [
      answer("a_1", 0, "Photosynthesis converts light energy…", "7", [3, 4]),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings[0].answerId).toBe("a_1");
    expect(mappings[0].methods).toContain("continuation");
    expect(mappings[0].reasons.some((r) => /pages 3 and 4/.test(r))).toBe(true);
  });

  it("recovers a label that handwriting OCR mangled by one character", async () => {
    const questions = [
      question("13", 0, "Explain the carbon cycle."),
      question("2", 1, "Define inertia."),
    ];
    // "18" is a plausible misread of "13" and no question 18 exists.
    const answers = [answer("a_1", 0, "The carbon cycle moves carbon…", "18")];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);
    const mapped = mappings.find((mapping) => mapping.questionId === "q_13");
    expect(mapped?.answerId).toBe("a_1");
    expect(mapped?.methods).toContain("fuzzy_label");
    // A repaired label is not certain evidence, so it must invite review.
    expect(mapped?.status).toBe("needs_review");
  });

  it("uses writing order to place an unlabelled answer between two anchors", async () => {
    const questions = [
      question("1", 0, "Define an ecosystem."),
      question("2", 1, "State Newton's first law."),
      question("3", 2, "Explain photosynthesis."),
    ];
    const answers = [
      answer("a_1", 0, "An ecosystem is a community.", "1"),
      answer("a_2", 1, "An object at rest stays at rest.", undefined),
      answer("a_3", 2, "Photosynthesis converts light.", "3"),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);
    const second = mappings.find((mapping) => mapping.questionId === "q_2");
    expect(second?.answerId).toBe("a_2");
    expect(second?.methods).toContain("structural_order");
  });

  it("falls back to content similarity when no labels are written at all", async () => {
    const questions = [
      question("1", 0, "Explain the process of photosynthesis in green plants."),
      question("2", 1, "Describe how blood circulates through the human heart."),
    ];
    const answers = [
      answer(
        "a_1",
        0,
        "Blood circulates through the heart via the atrium and ventricle chambers.",
      ),
      answer(
        "a_2",
        1,
        "Photosynthesis in green plants converts light energy using chlorophyll.",
      ),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    expect(mappings.find((m) => m.questionId === "q_1")?.answerId).toBe("a_2");
    expect(mappings.find((m) => m.questionId === "q_2")?.answerId).toBe("a_1");
    // Similarity alone must never present as a confident match.
    expect(mappings[0].status).toBe("needs_review");
  });

  it("never assigns the same answer to two questions", async () => {
    const questions = [
      question("1", 0, "Explain the process of photosynthesis in green plants."),
      question("2", 1, "Explain photosynthesis once more, in far greater detail."),
      question("3", 2, "Describe how blood circulates through the human heart."),
    ];
    const answers = [
      answer("a_1", 0, "Photosynthesis in green plants converts light energy.", "1"),
      answer("a_2", 1, "Blood circulates through the atrium and the ventricle."),
    ];

    const { mappings } = await mapAnswersToQuestions(questions, answers, noProviders);

    const assigned = mappings
      .map((mapping) => mapping.answerId)
      .filter((id): id is string => Boolean(id));
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(mappings.find((m) => m.questionId === "q_1")?.answerId).toBe("a_1");
  });

  it("leaves a question unanswered rather than forcing a weak similarity match", async () => {
    const questions = [
      question("1", 0, "Explain photosynthesis."),
      question("2", 1, "Explain photosynthesis again in more detail."),
    ];
    // Too little overlap to distinguish the two questions from each other.
    const answers = [answer("a_1", 0, "Photosynthesis converts light energy.")];

    const { mappings, unmatchedAnswerIds } = await mapAnswersToQuestions(
      questions,
      answers,
      noProviders,
    );

    const assigned = mappings.filter((mapping) => mapping.answerId);
    expect(assigned.length).toBeLessThanOrEqual(1);
    if (assigned.length === 0) {
      expect(unmatchedAnswerIds).toEqual(["a_1"]);
      expect(mappings.every((m) => m.status === "unanswered")).toBe(true);
    }
  });

  it("lowers confidence when the handwriting itself was barely readable", async () => {
    const questions = [question("1", 0, "Define an ecosystem.")];
    const low = answer("a_1", 0, "an ecosytm is a comunty", "1");
    low.confidence = 0.2;

    const { mappings } = await mapAnswersToQuestions(questions, [low], noProviders);
    expect(mappings[0].confidence).toBeLessThanOrEqual(0.6);
    expect(mappings[0].status).toBe("needs_review");
    expect(mappings[0].reasons.some((r) => /difficult to read/i.test(r))).toBe(true);
  });
});
