import { describe, expect, it } from "vitest";
import { asConfidence, asNumber, extractJson } from "@/lib/ai/json";

describe("extractJson", () => {
  it("parses a clean payload", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a fenced code block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers an object buried in commentary", () => {
    const raw = 'Sure! Here is the result:\n{"regions":[{"index":0}]}\nHope that helps.';
    expect(extractJson(raw)).toEqual({ regions: [{ index: 0 }] });
  });

  it("is not fooled by braces inside strings", () => {
    const raw = 'text {"text":"a } b","n":2} trailing';
    expect(extractJson(raw)).toEqual({ text: "a } b", n: 2 });
  });

  it("handles escaped quotes inside strings", () => {
    const raw = '{"text":"she said \\"hi\\"","n":1}';
    expect(extractJson(raw)).toEqual({ text: 'she said "hi"', n: 1 });
  });

  it("returns null for unparseable output", () => {
    expect(extractJson("no json here at all")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("asConfidence", () => {
  it("accepts a 0..1 value unchanged", () => {
    expect(asConfidence(0.85)).toBe(0.85);
  });

  it("rescales a percentage into 0..1", () => {
    expect(asConfidence(85)).toBeCloseTo(0.85, 6);
  });

  it("clamps out-of-range values", () => {
    expect(asConfidence(-3)).toBe(0);
    expect(asConfidence(400)).toBe(1);
  });

  it("falls back when the value is missing or nonsense", () => {
    expect(asConfidence(undefined, 0.5)).toBe(0.5);
    expect(asConfidence("banana", 0.4)).toBe(0.4);
  });
});

describe("asNumber", () => {
  it("parses numeric strings the model may emit", () => {
    expect(asNumber("5", 0)).toBe(5);
    expect(asNumber("abc", 7)).toBe(7);
    expect(asNumber(null, 3)).toBe(3);
  });
});
