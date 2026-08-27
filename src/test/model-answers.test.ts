import { describe, expect, it, vi } from "vitest";
import { generateModelAnswers } from "@/lib/ai/model-answers";
import type { ReasoningProvider } from "@/lib/ai/provider";
import type { AnswerMapping, Question } from "@/lib/types/assessment";

function question(id: string, label: string, marks?: number): Question {
  return {
    id,
    label,
    normalizedLabel: label,
    text: `Question text for ${label}.`,
    pageNumber: 1,
    order: Number(label) || 0,
    marks,
  };
}

function mapping(questionId: string, status: AnswerMapping["status"]): AnswerMapping {
  return {
    questionId,
    answerId: status === "unanswered" ? undefined : "a_1",
    confidence: status === "unanswered" ? 0 : 0.9,
    band: status === "unanswered" ? "none" : "high",
    status,
    methods: [],
    reasons: [],
  };
}

function reasoning(value: unknown): ReasoningProvider {
  return { completeJson: async () => ({ ok: true, value }) };
}

describe("generateModelAnswers", () => {
  const questions = [
    question("q_1", "1", 2),
    question("q_2", "2", 5),
    question("q_3", "3", 3),
  ];
  const mappings = [
    mapping("q_1", "matched"),
    mapping("q_2", "unanswered"),
    mapping("q_3", "unanswered"),
  ];

  it("writes expected answers only for the unanswered questions", async () => {
    const seen: string[] = [];
    const provider: ReasoningProvider = {
      completeJson: async ({ prompt }) => {
        seen.push(prompt);
        return {
          ok: true,
          value: {
            answers: [
              { questionId: "q_2", answer: "The expected answer.", keyPoints: ["a", "b"] },
              { questionId: "q_3", answer: "Another expected answer.", keyPoints: [] },
            ],
          },
        };
      },
    };

    const result = await generateModelAnswers({ questions, mappings, reasoning: provider });

    expect(result).toEqual({
      ok: true,
      answers: [
        { questionId: "q_2", answer: "The expected answer.", keyPoints: ["a", "b"] },
        { questionId: "q_3", answer: "Another expected answer.", keyPoints: [] },
      ],
    });
    // The answered question must never be sent for a model answer.
    expect(seen[0]).toContain("q_2");
    expect(seen[0]).toContain("q_3");
    expect(seen[0]).not.toContain("q_1");
  });

  it("passes the question's marks so the depth can match", async () => {
    let prompt = "";
    await generateModelAnswers({
      questions,
      mappings,
      reasoning: {
        completeJson: async (params) => {
          prompt = params.prompt;
          return { ok: true, value: { answers: [{ questionId: "q_2", answer: "x" }] } };
        },
      },
    });
    expect(prompt).toContain("maxMarks: 5");
    expect(prompt).toContain("maxMarks: 3");
  });

  it("returns nothing to do when every question was attempted", async () => {
    const allAnswered = questions.map((q) => mapping(q.id, "matched"));
    const provider = vi.fn();
    const result = await generateModelAnswers({
      questions,
      mappings: allAnswered,
      reasoning: { completeJson: provider },
    });

    expect(result).toEqual({ ok: true, answers: [] });
    // No unanswered questions means no call at all — nothing to spend on.
    expect(provider).not.toHaveBeenCalled();
  });

  it("drops an entry the model declined to answer rather than inventing one", async () => {
    const result = await generateModelAnswers({
      questions,
      mappings,
      reasoning: reasoning({
        answers: [
          { questionId: "q_2", answer: "   ", keyPoints: [] },
          { questionId: "q_3", answer: "A real answer.", keyPoints: ["point"] },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      answers: [{ questionId: "q_3", answer: "A real answer.", keyPoints: ["point"] }],
    });
  });

  it("ignores answers for questions that were not asked for", async () => {
    const result = await generateModelAnswers({
      questions,
      mappings,
      reasoning: reasoning({
        answers: [
          { questionId: "q_1", answer: "Should be ignored — q_1 was answered." },
          { questionId: "q_99", answer: "Should be ignored — no such question." },
          { questionId: "q_2", answer: "Kept." },
        ],
      }),
    });

    expect(result).toEqual({ ok: true, answers: [{ questionId: "q_2", answer: "Kept.", keyPoints: [] }] });
  });

  it("caps key points so one card cannot swamp the list", async () => {
    const result = await generateModelAnswers({
      questions,
      mappings,
      reasoning: reasoning({
        answers: [
          { questionId: "q_2", answer: "x", keyPoints: ["1","2","3","4","5","6","7"] },
        ],
      }),
    });
    expect(result.ok && result.answers[0].keyPoints).toHaveLength(5);
  });

  it("reports why it could not run instead of failing silently", async () => {
    expect(
      await generateModelAnswers({ questions, mappings, reasoning: null }),
    ).toEqual({ ok: false, kind: "not_configured" });

    expect(
      await generateModelAnswers({
        questions,
        mappings,
        reasoning: { completeJson: async () => ({ ok: false, kind: "quota" }) },
      }),
    ).toEqual({ ok: false, kind: "quota" });

    expect(
      await generateModelAnswers({ questions, mappings, reasoning: reasoning({ answers: [] }) }),
    ).toEqual({ ok: false, kind: "unusable_response" });
  });
});
