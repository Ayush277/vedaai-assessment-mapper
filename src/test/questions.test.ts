import { describe, expect, it } from "vitest";
import { extractQuestions } from "@/lib/extraction/questions";
import { transcriptFromLines } from "./helpers";

describe("extractQuestions", () => {
  it("treats labelled sub-parts as separate questions and keeps printed order", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [
          ["10. Define osmosis in one sentence."],
          ["11. Answer the parts below."],
          ["11 (a). Explain the process of normalization."],
          ["11 (b). Give one example of a normalized table."],
          ["12. Calculate the area of a circle of radius 7cm."],
        ],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);

    expect(questions.map((question) => question.normalizedLabel)).toEqual([
      "10",
      "11",
      "11a",
      "11b",
      "12",
    ]);
    // 11(a) and 11(b) must never be folded into 11.
    expect(questions.filter((q) => q.normalizedLabel.startsWith("11"))).toHaveLength(3);
    expect(questions.map((q) => q.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("preserves the original label text as printed", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [["Q1. What is photosynthesis?"], ["5(ii) Name two enzymes."]],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    expect(questions[0].label).toBe("Q1.");
    expect(questions[1].label).toBe("5(ii)");
    expect(questions[1].normalizedLabel).toBe("5ii");
  });

  it("links a sub-part to its parent question", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [
          ["11. Answer both parts."],
          ["11(a) Explain normalization."],
          ["11(b) Explain denormalization."],
        ],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    const parent = questions.find((q) => q.normalizedLabel === "11");
    const subA = questions.find((q) => q.normalizedLabel === "11a");
    expect(subA?.parentId).toBe(parent?.id);
  });

  it("captures marks and sections when they are printed", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [
          ["Section B"],
          ["4. Describe the water cycle. [5]"],
          ["5. State Newton's first law. (2 marks)"],
        ],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    expect(questions[0].marks).toBe(5);
    expect(questions[0].section).toBe("Section B");
    expect(questions[1].marks).toBe(2);
    expect(questions[0].text).not.toContain("[5]");
  });

  it("rebuilds printed order across pages rather than trusting input order", async () => {
    const transcript = transcriptFromLines([
      { pageNumber: 2, blocks: [["3. Third question text here."]] },
      { pageNumber: 1, blocks: [["1. First question text here."], ["2. Second question text."]] },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    expect(questions.map((q) => q.normalizedLabel)).toEqual(["1", "2", "3"]);
    expect(questions.map((q) => q.pageNumber)).toEqual([1, 1, 2]);
  });

  it("gives each question a bounding box drawn from its own lines", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [["1. First question text."], ["2. Second question text."]],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    const [first, second] = questions;
    expect(first.bbox).toBeDefined();
    expect(second.bbox).toBeDefined();
    // Distinct questions must not share one page-sized rectangle.
    expect(second.bbox!.y).toBeGreaterThan(first.bbox!.y);
    expect(first.bbox!.height).toBeLessThan(0.5);
  });

  it("ignores page furniture that looks numeric", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [
          ["Page 1 of 4"],
          ["Time: 3 hours"],
          ["1. Define an ecosystem."],
        ],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    expect(questions).toHaveLength(1);
    expect(questions[0].normalizedLabel).toBe("1");
  });

  it("splits two questions that OCR returned on a single line", async () => {
    // Tightly set papers routinely put the tail of one question and the start
    // of the next into one OCR line.
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [
          [
            "11 (b) Give one example of a table in second normal form. 12. Calculate the area of a circle whose radius is 7 cm.",
          ],
        ],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);

    expect(questions.map((q) => q.normalizedLabel)).toEqual(["11b", "12"]);
    expect(questions[0].text).not.toContain("Calculate");
    expect(questions[1].text).toContain("area of a circle");
    // The split halves must not share one box.
    expect(questions[1].bbox!.x).toBeGreaterThan(questions[0].bbox!.x);
  });

  it("does not split arithmetic or headers that merely contain numbers", async () => {
    const transcript = transcriptFromLines([
      {
        pageNumber: 1,
        blocks: [["12. Calculate 22/7 x 7 x 7. Time: 3 hours for 2 sections."]],
      },
    ]);

    const { questions } = await extractQuestions(transcript, null);
    expect(questions).toHaveLength(1);
    expect(questions[0].normalizedLabel).toBe("12");
  });

  it("reports a warning instead of inventing questions for an unreadable paper", async () => {
    const transcript = transcriptFromLines([
      { pageNumber: 1, blocks: [["", ""]] },
    ]);
    const { questions, warnings } = await extractQuestions(transcript, null);
    expect(questions).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
