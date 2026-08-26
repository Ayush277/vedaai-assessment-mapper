import { describe, expect, it } from "vitest";
import {
  classifyDegradation,
  describeDegradation,
  ProviderAuthError,
  ProviderError,
  ProviderNetworkError,
  RateLimitError,
  type ReasoningProvider,
} from "@/lib/ai/provider";
import { gradeAssessment } from "@/lib/ai/grading";
import { extractQuestions } from "@/lib/extraction/questions";
import { mapAnswersToQuestions } from "@/lib/mapping/mapper";
import { buildSimilarityMatrix } from "@/lib/mapping/semantic";
import { isActionableDegradation } from "@/lib/types/assessment";
import type { Answer, Question } from "@/lib/types/assessment";
import { transcriptFromLines } from "./helpers";

/** A reasoning provider that always fails with the given cause. */
function failingReasoning(kind: Parameters<typeof describeDegradation>[0]): ReasoningProvider {
  return { completeJson: async () => ({ ok: false, kind }) };
}

describe("classifyDegradation", () => {
  it("names the cause a teacher can act on", () => {
    expect(classifyDegradation(new RateLimitError("quota gone"))).toBe("quota");
    expect(classifyDegradation(new ProviderAuthError("bad key", 400))).toBe(
      "credentials",
    );
    expect(classifyDegradation(new ProviderError("no model", 404))).toBe(
      "misconfigured",
    );
    expect(classifyDegradation(new ProviderError("boom", 503))).toBe(
      "provider_unavailable",
    );
    expect(classifyDegradation(new ProviderNetworkError("timed out"))).toBe(
      "network",
    );
    expect(classifyDegradation(new Error("fetch failed"))).toBe("network");
    expect(classifyDegradation(new Error("nonsense"))).toBe("unusable_response");
  });

  it("marks only the causes worth acting on as actionable", () => {
    expect(isActionableDegradation("quota")).toBe(true);
    expect(isActionableDegradation("credentials")).toBe(true);
    expect(isActionableDegradation("misconfigured")).toBe(true);
    expect(isActionableDegradation("network")).toBe(false);
    expect(isActionableDegradation("not_configured")).toBe(false);
  });
});

describe("describeDegradation", () => {
  it("tells the reader what to do about a quota", () => {
    const message = describeDegradation("quota", "grading");
    expect(message).toMatch(/quota ran out/i);
    expect(message).toMatch(/try again/i);
    expect(message).toMatch(/grading/);
  });

  it("points at the key when credentials are rejected", () => {
    expect(describeDegradation("credentials", "grading")).toMatch(/AI_API_KEY/);
  });

  it("points at the model when the request is rejected", () => {
    expect(describeDegradation("misconfigured", "grading")).toMatch(/AI_MODEL/);
  });

  it("never leaks provider internals", () => {
    for (const kind of [
      "quota",
      "credentials",
      "misconfigured",
      "network",
      "provider_unavailable",
      "unusable_response",
      "not_configured",
    ] as const) {
      const message = describeDegradation(kind, "grading");
      expect(message).not.toMatch(/\{|\}|http|stack/i);
      expect(message.length).toBeGreaterThan(20);
    }
  });
});

describe("grading reports why it did not run", () => {
  const questions: Question[] = [
    {
      id: "q_1",
      label: "1",
      normalizedLabel: "1",
      text: "Define an ecosystem.",
      pageNumber: 1,
      order: 0,
      marks: 2,
    },
  ];
  const answers: Answer[] = [
    {
      id: "a_1",
      text: "A community of organisms.",
      regions: [{ pageNumber: 1, bbox: { x: 0, y: 0, width: 0.5, height: 0.1 } }],
      confidence: 0.9,
      appearsIncomplete: false,
      order: 0,
    },
  ];
  const mappings = [
    {
      questionId: "q_1",
      answerId: "a_1",
      confidence: 0.97,
      band: "high" as const,
      status: "matched" as const,
      methods: [],
      reasons: [],
    },
  ];

  it("distinguishes an exhausted quota from an unconfigured provider", async () => {
    const quota = await gradeAssessment({
      questions,
      answers,
      mappings,
      reasoning: failingReasoning("quota"),
    });
    expect(quota).toEqual({ ok: false, kind: "quota" });

    const unset = await gradeAssessment({
      questions,
      answers,
      mappings,
      reasoning: null,
    });
    expect(unset).toEqual({ ok: false, kind: "not_configured" });
  });

  it("reports an unusable response separately from a failed call", async () => {
    const provider: ReasoningProvider = {
      completeJson: async () => ({ ok: true, value: { grades: [] } }),
    };
    const outcome = await gradeAssessment({
      questions,
      answers,
      mappings,
      reasoning: provider,
    });
    expect(outcome).toEqual({ ok: false, kind: "unusable_response" });
  });
});

describe("question extraction reports why structuring was skipped", () => {
  const transcript = transcriptFromLines([
    { pageNumber: 1, blocks: [["1. Define an ecosystem."], ["2. Define osmosis."]] },
  ]);

  it("still extracts questions when the AI check is unavailable", async () => {
    const result = await extractQuestions(transcript, failingReasoning("credentials"));

    // The deterministic pass carries the run; only the enhancement is lost.
    expect(result.questions).toHaveLength(2);
    expect(result.degradations).toEqual([
      {
        step: "question-structuring",
        kind: "credentials",
        message: expect.stringContaining("AI_API_KEY"),
      },
    ]);
  });

  it("says so when no provider is configured at all", async () => {
    const result = await extractQuestions(transcript, null);
    expect(result.questions).toHaveLength(2);
    expect(result.degradations[0].kind).toBe("not_configured");
  });
});

describe("semantic matching reports its fallback", () => {
  it("falls back to lexical and names the cause", async () => {
    const matrix = await buildSimilarityMatrix(
      ["an answer about plants"],
      ["a question about plants"],
      { embed: async () => ({ ok: false, kind: "quota" }) },
    );
    expect(matrix.method).toBe("lexical");
    expect(matrix.degradedBecause).toBe("quota");
  });

  it("reports nothing when embeddings were never available", async () => {
    const matrix = await buildSimilarityMatrix(["a"], ["b"], null);
    expect(matrix.method).toBe("lexical");
    expect(matrix.degradedBecause).toBeUndefined();
  });
});

describe("mapper surfaces matching degradations", () => {
  it("still maps by label while reporting the embedding fallback", async () => {
    const questions: Question[] = [
      {
        id: "q_1",
        label: "1",
        normalizedLabel: "1",
        text: "Define an ecosystem.",
        pageNumber: 1,
        order: 0,
      },
      {
        id: "q_2",
        label: "2",
        normalizedLabel: "2",
        text: "Define osmosis in plant cells.",
        pageNumber: 1,
        order: 1,
      },
      // A third open question makes structural order ambiguous, so the
      // similarity step actually runs and its fallback becomes observable.
      {
        id: "q_3",
        label: "3",
        normalizedLabel: "3",
        text: "Describe how blood circulates through the heart.",
        pageNumber: 1,
        order: 2,
      },
    ];
    const answers: Answer[] = [
      {
        id: "a_1",
        text: "A community of organisms.",
        recognizedLabel: "1",
        normalizedRecognizedLabel: "1",
        regions: [{ pageNumber: 1, bbox: { x: 0, y: 0, width: 0.5, height: 0.1 } }],
        confidence: 0.9,
        appearsIncomplete: false,
        order: 0,
      },
      {
        id: "a_2",
        text: "Water moving across a membrane in plant cells.",
        regions: [{ pageNumber: 1, bbox: { x: 0, y: 0.2, width: 0.5, height: 0.1 } }],
        confidence: 0.9,
        appearsIncomplete: false,
        order: 1,
      },
    ];

    const result = await mapAnswersToQuestions(questions, answers, {
      embeddings: { embed: async () => ({ ok: false, kind: "quota" }) },
      reasoning: null,
    });

    // The label match is untouched by the degradation.
    expect(result.mappings.find((m) => m.questionId === "q_1")?.answerId).toBe("a_1");
    expect(result.similarityMethod).toBe("lexical");
    expect(result.degradations.some((d) => d.kind === "quota")).toBe(true);
  });
});
