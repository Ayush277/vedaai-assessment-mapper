import { describe, expect, it } from "vitest";
import { toNormalized, unionNormalized } from "@/lib/vision/segmentation";
import type { NormalizedBoundingBox } from "@/lib/types/assessment";

/** Mirrors exactly what HighlightOverlay does with CSS percentages. */
function renderBox(
  bbox: NormalizedBoundingBox,
  renderedWidth: number,
  renderedHeight: number,
) {
  return {
    left: bbox.x * renderedWidth,
    top: bbox.y * renderedHeight,
    width: bbox.width * renderedWidth,
    height: bbox.height * renderedHeight,
  };
}

describe("toNormalized", () => {
  it("converts pixel boxes into 0..1 page space", () => {
    const bbox = toNormalized({ x: 120, y: 340, width: 820, height: 180 }, 1600, 2000);
    expect(bbox.x).toBeCloseTo(0.075, 5);
    expect(bbox.y).toBeCloseTo(0.17, 5);
    expect(bbox.width).toBeCloseTo(0.5125, 5);
    expect(bbox.height).toBeCloseTo(0.09, 5);
  });

  it("keeps every component inside the page", () => {
    const bbox = toNormalized(
      { x: -50, y: -20, width: 5000, height: 9000 },
      1600,
      2000,
    );
    expect(bbox.x).toBe(0);
    expect(bbox.y).toBe(0);
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(1);
    expect(bbox.y + bbox.height).toBeLessThanOrEqual(1);
  });

  it("never lets a box extend past the right or bottom edge", () => {
    const bbox = toNormalized({ x: 1500, y: 1900, width: 400, height: 400 }, 1600, 2000);
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(1.0000001);
    expect(bbox.y + bbox.height).toBeLessThanOrEqual(1.0000001);
  });
});

describe("highlight rendering at different viewer sizes", () => {
  const source = { x: 142, y: 380, width: 730, height: 410 };
  const pageWidth = 1600;
  const pageHeight = 2200;
  const bbox = toNormalized(source, pageWidth, pageHeight);

  it("lands on the same pixels when rendered at the source resolution", () => {
    const rect = renderBox(bbox, pageWidth, pageHeight);
    expect(rect.left).toBeCloseTo(source.x, 4);
    expect(rect.top).toBeCloseTo(source.y, 4);
    expect(rect.width).toBeCloseTo(source.width, 4);
    expect(rect.height).toBeCloseTo(source.height, 4);
  });

  it("keeps the same relative position at every viewer width", () => {
    for (const scale of [0.35, 0.5, 1, 1.75, 3]) {
      const renderedWidth = pageWidth * scale;
      const renderedHeight = pageHeight * scale;
      const rect = renderBox(bbox, renderedWidth, renderedHeight);

      expect(rect.left / renderedWidth).toBeCloseTo(source.x / pageWidth, 6);
      expect(rect.width / renderedWidth).toBeCloseTo(source.width / pageWidth, 6);
      expect(rect.top / renderedHeight).toBeCloseTo(source.y / pageHeight, 6);
      expect(rect.height / renderedHeight).toBeCloseTo(source.height / pageHeight, 6);
    }
  });

  it("scales linearly, so zooming twice doubles the overlay", () => {
    const small = renderBox(bbox, 800, 1100);
    const large = renderBox(bbox, 1600, 2200);
    expect(large.left).toBeCloseTo(small.left * 2, 6);
    expect(large.width).toBeCloseTo(small.width * 2, 6);
    expect(large.height).toBeCloseTo(small.height * 2, 6);
  });

  it("covers only its own region, not the whole page", () => {
    // Guards against the failure mode of highlighting an entire page.
    expect(bbox.width * bbox.height).toBeLessThan(0.5);
    expect(bbox.width).toBeLessThan(1);
    expect(bbox.height).toBeLessThan(1);
  });
});

describe("unionNormalized", () => {
  it("wraps several regions into one enclosing box", () => {
    const union = unionNormalized([
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { x: 0.5, y: 0.6, width: 0.3, height: 0.1 },
    ]);
    expect(union!.x).toBeCloseTo(0.1, 6);
    expect(union!.y).toBeCloseTo(0.1, 6);
    expect(union!.width).toBeCloseTo(0.7, 6);
    expect(union!.height).toBeCloseTo(0.6, 6);
  });

  it("returns null when there is nothing to union", () => {
    expect(unionNormalized([])).toBeNull();
  });
});
