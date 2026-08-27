import { describe, expect, it } from "vitest";
import {
  labelSortKey,
  normalizeLabel,
  parseLabel,
  splitLeadingLabel,
} from "@/lib/mapping/normalize-label";

describe("normalizeLabel", () => {
  it("reduces every common spelling of a sub-part to one canonical form", () => {
    for (const variant of [
      "11(a)",
      "11 (a)",
      "11-a",
      "11.a",
      "Q11(a)",
      "Q 11 (a)",
      "Question 11(a)",
      "11a",
      "Ans. 11(a)",
    ]) {
      expect(normalizeLabel(variant), variant).toBe("11a");
    }
  });

  it("keeps a parent question distinct from its sub-parts", () => {
    expect(normalizeLabel("11")).toBe("11");
    expect(normalizeLabel("11(a)")).toBe("11a");
    expect(normalizeLabel("11(b)")).toBe("11b");
  });

  it("handles roman-numeral sub-parts", () => {
    expect(normalizeLabel("5(i)")).toBe("5i");
    expect(normalizeLabel("5 (ii)")).toBe("5ii");
    expect(normalizeLabel("5(iii)")).toBe("5iii");
  });

  it("strips section and answer prefixes", () => {
    expect(normalizeLabel("Section B - 4")).toBe("4");
    expect(normalizeLabel("Part A: 7")).toBe("7");
    expect(normalizeLabel("Answer 12")).toBe("12");
    expect(normalizeLabel("Sol. 3")).toBe("3");
  });

  it("normalises leading zeros", () => {
    expect(normalizeLabel("07")).toBe("7");
  });

  it("returns an empty label for text that has no question number", () => {
    expect(normalizeLabel("Explain photosynthesis.")).toBe("");
    expect(normalizeLabel("")).toBe("");
    expect(normalizeLabel(undefined)).toBe("");
  });

  it("recovers digits from common handwriting OCR confusions", () => {
    // "l1(a)" is what OCR frequently makes of "11(a)".
    expect(normalizeLabel("l1(a)")).toBe("11a");
    expect(normalizeLabel("Q l2")).toBe("12");
  });

  it("keeps the sub-part when OCR loses the closing bracket", () => {
    // A bracket is a thin stroke and handwriting OCR drops it constantly.
    // Losing it used to collapse "11 (b" onto "11", which handed the answer to
    // the parent stem and left both real sub-parts reading as unanswered.
    expect(normalizeLabel("11 (b")).toBe("11b");
    expect(normalizeLabel("11 (a")).toBe("11a");
    expect(normalizeLabel("5 (ii")).toBe("5ii");
    expect(normalizeLabel("11 b)")).toBe("11b");
    expect(normalizeLabel("11[a")).toBe("11a");
  });

  it("still reads a bare parent number as the parent", () => {
    expect(normalizeLabel("11")).toBe("11");
    expect(normalizeLabel("11.")).toBe("11");
  });

  it("records the parent question for a sub-part", () => {
    expect(parseLabel("11(b)")).toMatchObject({ main: "11", sub: "b", parent: "11" });
    expect(parseLabel("11").parent).toBeUndefined();
  });
});

describe("splitLeadingLabel", () => {
  it("separates the label from the question body", () => {
    const result = splitLeadingLabel("11 (a) Explain the process of normalization.");
    expect(result.normalized).toBe("11a");
    expect(result.rest).toBe("Explain the process of normalization.");
  });

  it("does not treat the first word of a sentence as a sub-part", () => {
    const result = splitLeadingLabel("1 What is photosynthesis?");
    expect(result.normalized).toBe("1");
    expect(result.rest).toBe("What is photosynthesis?");
  });

  it("strips a label whose closing bracket was lost", () => {
    const result = splitLeadingLabel("11 (b A student table with roll no as the key");
    expect(result.normalized).toBe("11b");
    expect(result.rest).toBe("A student table with roll no as the key");
  });

  it("returns no label for an unnumbered line", () => {
    expect(splitLeadingLabel("The mitochondria is the powerhouse.").normalized).toBe("");
  });
});

describe("labelSortKey", () => {
  it("orders 2 before 10 rather than lexicographically", () => {
    const labels = ["10", "2", "11a", "11", "11b", "1"];
    const sorted = [...labels].sort((a, b) => {
      const [an, as] = labelSortKey(a);
      const [bn, bs] = labelSortKey(b);
      return an === bn ? as.localeCompare(bs) : an - bn;
    });
    expect(sorted).toEqual(["1", "2", "10", "11", "11a", "11b"]);
  });
});
