import type {
  NormalizedBoundingBox,
  PixelBoundingBox,
} from "@/lib/types/assessment";

/**
 * Layout segmentation: find *where* content sits on a page.
 *
 * This is deliberately independent of any AI provider. Language models are
 * unreliable at reporting pixel coordinates, so the pipeline never asks one
 * for a bounding box. Instead we detect ink regions here with classic
 * computer vision, then ask the vision model to transcribe those exact crops.
 * Text and coordinates therefore always refer to the same pixels by
 * construction rather than by the model's spatial guesswork.
 *
 * Pipeline: adaptive threshold -> rule/table-line suppression ->
 * horizontal projection profile -> text lines -> gap-based block grouping.
 */

export type TextLine = {
  bbox: PixelBoundingBox;
  /** Ink pixel count; used to weight noise filtering. */
  inkPixels: number;
};

export type LayoutBlock = {
  index: number;
  bbox: PixelBoundingBox;
  lines: TextLine[];
  /** True when the block's last line sits near the bottom edge of the page. */
  touchesPageBottom: boolean;
  /** True when the block's first line sits near the top edge of the page. */
  touchesPageTop: boolean;
};

export type PageLayout = {
  pageNumber: number;
  width: number;
  height: number;
  blocks: LayoutBlock[];
  /** Fraction of the page covered by ink. Near zero => blank page. */
  inkRatio: number;
};

export type SegmentationOptions = {
  /** Multiple of the median line pitch that still counts as the same block. */
  blockGapFactor?: number;
  /** Merge everything into one block per page (used for dense printed text). */
  minLineHeight?: number;
  /** Padding added around detected boxes, as a fraction of page width. */
  padRatio?: number;
};

const DEFAULTS = {
  blockGapFactor: 1.9,
  minLineHeight: 6,
  padRatio: 0.008,
} as const;

/* -------------------------------------------------------------------------- */
/*                            Adaptive thresholding                           */
/* -------------------------------------------------------------------------- */

/**
 * Bradley-Roth adaptive threshold via an integral image. Handles the uneven
 * lighting and shadows typical of phone-camera scans, where a single global
 * threshold either drops faint pencil or floods dark corners.
 */
export function adaptiveThreshold(
  pixels: Uint8Array,
  width: number,
  height: number,
  windowDivisor = 8,
  tPercent = 12,
): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += pixels[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const half = Math.max(1, Math.floor(width / windowDivisor / 2));
  const mask = new Uint8Array(width * height);
  const keep = (100 - tPercent) / 100;

  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];
      // Ink = darker than the local mean by more than t%.
      if (pixels[y * width + x] * count <= sum * keep) {
        mask[y * width + x] = 1;
      }
    }
  }

  return mask;
}

/* -------------------------------------------------------------------------- */
/*                         Ruled / table line suppression                      */
/* -------------------------------------------------------------------------- */

/**
 * Zero out long thin horizontal runs. Ruled answer sheets and bordered
 * question papers otherwise merge every line of writing into one block and
 * destroy the projection profile.
 */
export function suppressHorizontalRules(
  mask: Uint8Array,
  width: number,
  height: number,
  minRunRatio = 0.45,
  maxThickness = 5,
): void {
  const minRun = Math.floor(width * minRunRatio);

  for (let y = 0; y < height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= width; x += 1) {
      const isInk = x < width && mask[y * width + x] === 1;
      if (isInk && runStart === -1) {
        runStart = x;
      } else if (!isInk && runStart !== -1) {
        const runLength = x - runStart;
        if (runLength >= minRun) {
          // Only strip it when the band is thin — a thick dark band is a
          // filled shape (or a photo), not a rule.
          let thickness = 1;
          const probeX = runStart + Math.floor(runLength / 2);
          for (let dy = 1; dy <= maxThickness + 1; dy += 1) {
            const below = y + dy;
            if (below >= height || mask[below * width + probeX] !== 1) break;
            thickness += 1;
          }
          if (thickness <= maxThickness) {
            for (let dy = 0; dy < thickness; dy += 1) {
              const row = y + dy;
              if (row >= height) break;
              mask.fill(0, row * width + runStart, row * width + runStart + runLength);
            }
          }
        }
        runStart = -1;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                Line detection                              */
/* -------------------------------------------------------------------------- */

function rowProfile(mask: Uint8Array, width: number, height: number): Int32Array {
  const profile = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const base = y * width;
    for (let x = 0; x < width; x += 1) count += mask[base + x];
    profile[y] = count;
  }
  return profile;
}

function horizontalExtent(
  mask: Uint8Array,
  width: number,
  top: number,
  bottom: number,
): { left: number; right: number; ink: number } {
  let left = width;
  let right = -1;
  let ink = 0;
  for (let y = top; y <= bottom; y += 1) {
    const base = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[base + x] === 1) {
        ink += 1;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { left, right, ink };
}

/** Group rows whose ink exceeds a noise floor into text lines. */
export function detectLines(
  mask: Uint8Array,
  width: number,
  height: number,
  minLineHeight: number,
): TextLine[] {
  const profile = rowProfile(mask, width, height);
  // Noise floor scales with page width so it works at any render resolution.
  const floor = Math.max(2, Math.round(width * 0.004));

  const lines: TextLine[] = [];
  let top = -1;

  for (let y = 0; y <= height; y += 1) {
    const active = y < height && profile[y] > floor;
    if (active && top === -1) {
      top = y;
    } else if (!active && top !== -1) {
      const bottom = y - 1;
      if (bottom - top + 1 >= Math.max(2, Math.floor(minLineHeight / 2))) {
        const { left, right, ink } = horizontalExtent(mask, width, top, bottom);
        if (right >= left) {
          lines.push({
            bbox: {
              x: left,
              y: top,
              width: right - left + 1,
              height: bottom - top + 1,
            },
            inkPixels: ink,
          });
        }
      }
      top = -1;
    }
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/*                               Block grouping                               */
/* -------------------------------------------------------------------------- */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Low percentile of the gaps — the typical *within-paragraph* leading.
 * The median is not usable here: on a page with a few large paragraph breaks
 * it lands between the two populations and no gap ever looks big enough to
 * split on. A low percentile stays anchored to the ordinary line pitch.
 */
function lowPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentile * sorted.length)),
  );
  return sorted[index];
}

/**
 * Merge lines into blocks. A block break happens when the vertical gap to the
 * next line is clearly larger than the document's own line pitch — which is
 * how a human sees "a new answer starts here" without reading the words.
 */
export function groupLinesIntoBlocks(
  lines: TextLine[],
  gapFactor: number,
): TextLine[][] {
  if (lines.length === 0) return [];

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const previous = lines[i - 1].bbox;
    gaps.push(lines[i].bbox.y - (previous.y + previous.height));
  }
  const heights = lines.map((line) => line.bbox.height);
  const medianHeight = median(heights) || 12;
  const normalGap = lowPercentile(
    gaps.filter((gap) => gap >= 0),
    0.3,
  );
  // Fall back to line height when a page has too few lines to estimate a gap.
  const baseline = normalGap > 0 ? normalGap : medianHeight * 0.5;
  const threshold = Math.max(medianHeight * 0.8, baseline * gapFactor);

  const blocks: TextLine[][] = [];
  let current: TextLine[] = [lines[0]];

  for (let i = 1; i < lines.length; i += 1) {
    const previous = lines[i - 1].bbox;
    const gap = lines[i].bbox.y - (previous.y + previous.height);
    if (gap > threshold) {
      blocks.push(current);
      current = [lines[i]];
    } else {
      current.push(lines[i]);
    }
  }
  blocks.push(current);

  return blocks;
}

function unionBox(lines: TextLine[]): PixelBoundingBox {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const line of lines) {
    left = Math.min(left, line.bbox.x);
    top = Math.min(top, line.bbox.y);
    right = Math.max(right, line.bbox.x + line.bbox.width);
    bottom = Math.max(bottom, line.bbox.y + line.bbox.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/* -------------------------------------------------------------------------- */
/*                                   Public                                   */
/* -------------------------------------------------------------------------- */

export function segmentPage(
  grayscale: { pixels: Uint8Array; width: number; height: number },
  pageNumber: number,
  options: SegmentationOptions = {},
): PageLayout {
  const { blockGapFactor, minLineHeight, padRatio } = { ...DEFAULTS, ...options };
  const { pixels, width, height } = grayscale;

  const mask = adaptiveThreshold(pixels, width, height);
  suppressHorizontalRules(mask, width, height);

  let inkTotal = 0;
  for (let i = 0; i < mask.length; i += 1) inkTotal += mask[i];
  const inkRatio = inkTotal / (width * height);

  const lines = detectLines(mask, width, height, minLineHeight);
  const grouped = groupLinesIntoBlocks(lines, blockGapFactor);

  const pad = Math.round(width * padRatio);
  // Scanned pages carry a margin, so "reached the bottom" means the last line
  // sits inside the bottom band rather than literally on the edge.
  const bottomBand = height * 0.85;
  const topBand = height * 0.15;

  const blocks: LayoutBlock[] = grouped.map((groupLines, index) => {
    const raw = unionBox(groupLines);
    const x = Math.max(0, raw.x - pad);
    const y = Math.max(0, raw.y - pad);
    const bbox: PixelBoundingBox = {
      x,
      y,
      width: Math.min(width - x, raw.width + pad * 2),
      height: Math.min(height - y, raw.height + pad * 2),
    };
    const last = groupLines[groupLines.length - 1].bbox;
    const first = groupLines[0].bbox;
    return {
      index,
      bbox,
      lines: groupLines,
      touchesPageBottom: last.y + last.height >= bottomBand,
      touchesPageTop: first.y <= topBand,
    };
  });

  return { pageNumber, width, height, blocks, inkRatio };
}

/* -------------------------------------------------------------------------- */
/*                            Coordinate conversion                           */
/* -------------------------------------------------------------------------- */

/** The single place pixel boxes become the normalized boxes the UI renders. */
export function toNormalized(
  bbox: PixelBoundingBox,
  pageWidth: number,
  pageHeight: number,
): NormalizedBoundingBox {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp01(bbox.x / pageWidth);
  const y = clamp01(bbox.y / pageHeight);
  const width = Math.min(1 - x, clamp01(bbox.width / pageWidth));
  const height = Math.min(1 - y, clamp01(bbox.height / pageHeight));
  return { x, y, width, height };
}

/** Union of several normalized boxes, used to merge continuation regions. */
export function unionNormalized(
  boxes: NormalizedBoundingBox[],
): NormalizedBoundingBox | null {
  if (boxes.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
