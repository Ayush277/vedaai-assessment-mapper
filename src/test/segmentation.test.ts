import { describe, expect, it } from "vitest";
import {
  adaptiveThreshold,
  detectLines,
  groupLinesIntoBlocks,
  segmentPage,
  suppressHorizontalRules,
} from "@/lib/vision/segmentation";

const WIDTH = 200;
const HEIGHT = 300;

/** Paint a white page and draw dark bars where "text lines" should be. */
function makePage(
  bars: { y: number; height: number; x?: number; width?: number }[],
  extras: (pixels: Uint8Array) => void = () => {},
) {
  const pixels = new Uint8Array(WIDTH * HEIGHT).fill(245);
  for (const bar of bars) {
    const x0 = bar.x ?? 20;
    const barWidth = bar.width ?? 140;
    for (let y = bar.y; y < bar.y + bar.height; y += 1) {
      for (let x = x0; x < x0 + barWidth; x += 1) {
        pixels[y * WIDTH + x] = 20;
      }
    }
  }
  extras(pixels);
  return { pixels, width: WIDTH, height: HEIGHT };
}

describe("adaptiveThreshold", () => {
  it("marks dark pixels as ink and leaves the page background alone", () => {
    const page = makePage([{ y: 50, height: 6 }]);
    const mask = adaptiveThreshold(page.pixels, WIDTH, HEIGHT);
    expect(mask[52 * WIDTH + 60]).toBe(1);
    expect(mask[10 * WIDTH + 10]).toBe(0);
  });

  it("survives a lighting gradient that a global threshold would fail on", () => {
    const page = makePage([{ y: 150, height: 6 }]);
    // Darken the whole right half, as a shadow on a phone scan would.
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = WIDTH / 2; x < WIDTH; x += 1) {
        page.pixels[y * WIDTH + x] = Math.max(0, page.pixels[y * WIDTH + x] - 90);
      }
    }
    const mask = adaptiveThreshold(page.pixels, WIDTH, HEIGHT);
    // The bar is still found on the shadowed side...
    expect(mask[152 * WIDTH + 130]).toBe(1);
    // ...and the shadow itself is not mistaken for ink.
    expect(mask[20 * WIDTH + 190]).toBe(0);
  });
});

describe("suppressHorizontalRules", () => {
  it("removes ruled lines while keeping the writing above them", () => {
    const mask = new Uint8Array(WIDTH * HEIGHT);
    // A full-width 2px rule.
    for (let y = 100; y < 102; y += 1) mask.fill(1, y * WIDTH, y * WIDTH + WIDTH);
    // A short run of "writing".
    for (let y = 60; y < 66; y += 1) mask.fill(1, y * WIDTH + 30, y * WIDTH + 70);

    suppressHorizontalRules(mask, WIDTH, HEIGHT);

    expect(mask[100 * WIDTH + 100]).toBe(0);
    expect(mask[62 * WIDTH + 50]).toBe(1);
  });

  it("keeps a thick dark band, which is a shape rather than a rule", () => {
    const mask = new Uint8Array(WIDTH * HEIGHT);
    for (let y = 100; y < 130; y += 1) mask.fill(1, y * WIDTH, y * WIDTH + WIDTH);
    suppressHorizontalRules(mask, WIDTH, HEIGHT);
    expect(mask[115 * WIDTH + 100]).toBe(1);
  });
});

describe("detectLines", () => {
  it("finds one line per painted bar", () => {
    const page = makePage([
      { y: 40, height: 8 },
      { y: 60, height: 8 },
      { y: 80, height: 8 },
    ]);
    const mask = adaptiveThreshold(page.pixels, WIDTH, HEIGHT);
    const lines = detectLines(mask, WIDTH, HEIGHT, 6);
    expect(lines).toHaveLength(3);
    expect(lines[0].bbox.y).toBeGreaterThanOrEqual(38);
    expect(lines[0].bbox.y).toBeLessThanOrEqual(42);
  });

  it("returns the horizontal extent of each line, not the full page width", () => {
    const page = makePage([{ y: 40, height: 8, x: 50, width: 60 }]);
    const mask = adaptiveThreshold(page.pixels, WIDTH, HEIGHT);
    const [line] = detectLines(mask, WIDTH, HEIGHT, 6);
    expect(line.bbox.x).toBeGreaterThanOrEqual(48);
    expect(line.bbox.width).toBeLessThanOrEqual(64);
  });

  it("finds nothing on a blank page", () => {
    const page = makePage([]);
    const mask = adaptiveThreshold(page.pixels, WIDTH, HEIGHT);
    expect(detectLines(mask, WIDTH, HEIGHT, 6)).toHaveLength(0);
  });
});

describe("groupLinesIntoBlocks", () => {
  const line = (y: number, height = 8) => ({
    bbox: { x: 10, y, width: 100, height },
    inkPixels: 400,
  });

  it("splits on a gap that is clearly larger than the line pitch", () => {
    const lines = [line(10), line(24), line(38), line(120), line(134)];
    const blocks = groupLinesIntoBlocks(lines, 1.9);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveLength(3);
    expect(blocks[1]).toHaveLength(2);
  });

  it("keeps evenly spaced lines together as one block", () => {
    const lines = [line(10), line(24), line(38), line(52)];
    expect(groupLinesIntoBlocks(lines, 1.9)).toHaveLength(1);
  });

  it("handles a single line without dividing by zero", () => {
    expect(groupLinesIntoBlocks([line(10)], 1.9)).toHaveLength(1);
  });
});

describe("segmentPage", () => {
  it("produces normalized boxes that stay inside the page", () => {
    const page = makePage([
      { y: 30, height: 8 },
      { y: 44, height: 8 },
      { y: 150, height: 8 },
    ]);
    const layout = segmentPage(page, 1);

    expect(layout.blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of layout.blocks) {
      expect(block.bbox.x).toBeGreaterThanOrEqual(0);
      expect(block.bbox.y).toBeGreaterThanOrEqual(0);
      expect(block.bbox.x + block.bbox.width).toBeLessThanOrEqual(WIDTH);
      expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it("flags a block that runs to the bottom edge of the page", () => {
    const page = makePage([{ y: HEIGHT - 14, height: 10 }]);
    const layout = segmentPage(page, 1);
    expect(layout.blocks.at(-1)?.touchesPageBottom).toBe(true);
  });

  it("reports an almost-empty page through its ink ratio", () => {
    const layout = segmentPage(makePage([]), 1);
    expect(layout.inkRatio).toBeLessThan(0.001);
    expect(layout.blocks).toHaveLength(0);
  });
});
