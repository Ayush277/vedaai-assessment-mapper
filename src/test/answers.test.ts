import { describe, expect, it } from "vitest";
import { extractAnswers } from "@/lib/extraction/answers";
import { transcriptFromLines } from "./helpers";

describe("extractAnswers", () => {
  it("splits the sheet into one answer per written question label", () => {
    const transcript = transcriptFromLines(
      [
        {
          pageNumber: 1,
          blocks: [
            ["Normalization removes redundancy from tables."],
            ["A normalized table has one fact per row."],
            ["Area equals pi r squared, so 154 square cm."],
          ],
        },
      ],
      {
        labels: { "1:0": "11(a)", "1:1": "11(b)", "1:2": "12" },
      },
    );

    const { answers } = extractAnswers(transcript);

    expect(answers).toHaveLength(3);
    expect(answers.map((answer) => answer.normalizedRecognizedLabel)).toEqual([
      "11a",
      "11b",
      "12",
    ]);
    // The label itself must not be left inside the answer body.
    expect(answers[0].text).toBe("Normalization removes redundancy from tables.");
  });

  it("detects a label the student wrote even when the provider reports none", () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [["Q3 The mitochondria releases energy for the cell."]],
      },
    ]);

    const { answers } = extractAnswers(transcript);
    expect(answers[0].normalizedRecognizedLabel).toBe("3");
    expect(answers[0].text).toBe("The mitochondria releases energy for the cell.");
  });

  it("treats an unlabelled block as a continuation of the answer above it", () => {
    const transcript = transcriptFromLines(
      [
        {
          pageNumber: 1,
          blocks: [
            ["The water cycle begins with evaporation."],
            ["It then condenses into clouds and falls as rain."],
          ],
        },
      ],
      { labels: { "1:0": "4" }, continuation: ["1:1"] },
    );

    const { answers } = extractAnswers(transcript);
    expect(answers).toHaveLength(1);
    expect(answers[0].regions).toHaveLength(2);
    expect(answers[0].text).toContain("evaporation");
    expect(answers[0].text).toContain("condenses");
  });

  it("joins an answer that continues onto the next page into one answer", () => {
    const transcript = transcriptFromLines(
      [
        { pageNumber: 3, blocks: [["Photosynthesis converts light energy"]] },
        { pageNumber: 4, blocks: [["into chemical energy stored as glucose."]] },
      ],
      {
        labels: { "3:0": "7" },
        touchesBottom: ["3:0"],
        touchesTop: ["4:0"],
      },
    );

    const { answers } = extractAnswers(transcript);

    expect(answers).toHaveLength(1);
    expect(answers[0].regions.map((region) => region.pageNumber)).toEqual([3, 4]);
    expect(new Set(answers[0].regions.map((r) => r.pageNumber)).size).toBe(2);
  });

  it("carries an answer across a page break on the reader's continuation signal alone", () => {
    // Geometry is unavailable here (neither block touches a page edge), so the
    // provider's judgement that the text continues is the deciding signal.
    const transcript = transcriptFromLines(
      [
        { pageNumber: 2, blocks: [["The light reaction captures energy and"]] },
        { pageNumber: 3, blocks: [["stores it as ATP for the dark reaction."]] },
      ],
      { labels: { "2:0": "7" }, continuation: ["3:0"] },
    );

    const { answers } = extractAnswers(transcript);
    expect(answers).toHaveLength(1);
    expect(answers[0].regions.map((r) => r.pageNumber)).toEqual([2, 3]);
  });

  it("starts a new answer on a new page when the previous one ended mid-page", () => {
    const transcript = transcriptFromLines(
      [
        { pageNumber: 1, blocks: [["Short answer that ends well above the margin."]] },
        { pageNumber: 2, blocks: [["A completely separate piece of writing."]] },
      ],
      { labels: { "1:0": "2" } },
    );

    const { answers } = extractAnswers(transcript);
    expect(answers).toHaveLength(2);
  });

  it("ignores content the student crossed out", () => {
    const transcript = transcriptFromLines(
      [
        {
          pageNumber: 1,
          blocks: [["This attempt was abandoned."], ["The correct answer is 42."]],
        },
      ],
      { labels: { "1:0": "5", "1:1": "5" }, struckOut: ["1:0"] },
    );

    const { answers } = extractAnswers(transcript);
    expect(answers).toHaveLength(1);
    expect(answers[0].text).toBe("The correct answer is 42.");
  });

  it("flags an answer that runs to the bottom edge as possibly incomplete", () => {
    const transcript = transcriptFromLines(
      [{ pageNumber: 1, blocks: [["The three stages of the process are"]] }],
      { labels: { "1:0": "8" }, touchesBottom: ["1:0"] },
    );

    const { answers } = extractAnswers(transcript);
    expect(answers[0].appearsIncomplete).toBe(true);
  });

  it("warns when the handwriting confidence is low", () => {
    const transcript = transcriptFromLines(
      [{ pageNumber: 1, blocks: [["ilegble scrwl heer"]] }],
      { labels: { "1:0": "9" }, confidences: { "1:0": 0.2 } },
    );

    const { warnings } = extractAnswers(transcript);
    expect(warnings.some((warning) => /hard to read/i.test(warning))).toBe(true);
  });
});
