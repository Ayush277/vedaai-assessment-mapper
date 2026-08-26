import type {
  DocumentTranscript,
  TranscribedBlock,
  TranscribedLine,
} from "@/lib/extraction/types";
import type { NormalizedBoundingBox } from "@/lib/types/assessment";

/** Build a transcript from plain lines, laying them out top-to-bottom. */
export function transcriptFromLines(
  pages: { pageNumber: number; blocks: string[][] }[],
  options: {
    labels?: Record<string, string>;
    confidences?: Record<string, number>;
    continuation?: string[];
    struckOut?: string[];
    touchesBottom?: string[];
    touchesTop?: string[];
  } = {},
): DocumentTranscript {
  const blocks: TranscribedBlock[] = [];

  for (const page of pages) {
    let cursor = 0.05;
    page.blocks.forEach((lines, blockIndex) => {
      const key = `${page.pageNumber}:${blockIndex}`;
      const lineHeight = 0.03;
      const blockHeight = lines.length * lineHeight;

      const bbox: NormalizedBoundingBox = {
        x: 0.1,
        y: cursor,
        width: 0.8,
        height: blockHeight,
      };

      const transcribedLines: TranscribedLine[] = lines.map((text, lineIndex) => ({
        pageNumber: page.pageNumber,
        blockIndex,
        lineIndex,
        bbox: {
          x: 0.1,
          y: cursor + lineIndex * lineHeight,
          width: 0.8,
          height: lineHeight,
        },
        text,
        confidence: options.confidences?.[key] ?? 0.9,
      }));

      blocks.push({
        pageNumber: page.pageNumber,
        blockIndex,
        bbox,
        text: lines.join("\n"),
        label: options.labels?.[key],
        confidence: options.confidences?.[key] ?? 0.9,
        isContinuation: options.continuation?.includes(key) ?? false,
        struckOut: options.struckOut?.includes(key) ?? false,
        touchesPageBottom: options.touchesBottom?.includes(key) ?? false,
        touchesPageTop: options.touchesTop?.includes(key) ?? false,
        lines: transcribedLines,
      });

      cursor += blockHeight + 0.04;
    });
  }

  return { blocks, blankPages: [] };
}
