import "server-only";
import type { VisionProvider } from "@/lib/ai/provider";
import type { PageBitmap } from "@/lib/document/normalize";
import { cropRegion, pageThumbnail, toGrayscale } from "@/lib/document/images";
import type {
  DocumentTranscript,
  TranscribedBlock,
  TranscribedLine,
} from "@/lib/extraction/types";
import { segmentPage, toNormalized, type LayoutBlock } from "./segmentation";

/**
 * Turns rendered pages into transcribed blocks whose coordinates are real.
 *
 * The ordering matters: segment first, crop second, transcribe third. Because
 * the provider only ever sees a crop that `segmentPage` produced, the text it
 * returns is anchored to those exact pixels — no coordinate guessing, and the
 * highlight the teacher sees is the region that was actually read.
 */

type Mode = "printed" | "handwritten";

const TUNING: Record<Mode, { blockGapFactor: number; maxBlocksPerPage: number }> = {
  // Printed papers are tightly set; larger groups mean fewer, cheaper crops.
  printed: { blockGapFactor: 2.3, maxBlocksPerPage: 26 },
  // Handwriting needs finer splits so separate answers stay separate.
  handwritten: { blockGapFactor: 1.55, maxBlocksPerPage: 22 },
};

/** Ink coverage below this means the page is effectively blank. */
const BLANK_PAGE_INK_RATIO = 0.0012;
/** How much of the previous page's tail to carry forward as context. */
const PAGE_TAIL_CHARS = 220;
/** Discard specks: blocks smaller than this share of the page are noise. */
const MIN_BLOCK_AREA_RATIO = 0.0006;
const MIN_BLOCK_HEIGHT_PX = 10;

function isMeaningful(block: LayoutBlock, width: number, height: number): boolean {
  const area = block.bbox.width * block.bbox.height;
  if (area / (width * height) < MIN_BLOCK_AREA_RATIO) return false;
  if (block.bbox.height < MIN_BLOCK_HEIGHT_PX) return false;
  return true;
}

/**
 * Merge the smallest-gap neighbours until the page is within budget. Keeps
 * page cost bounded without ever dropping content off the page.
 */
function capBlocks(blocks: LayoutBlock[], max: number): LayoutBlock[] {
  if (blocks.length <= max) return blocks;

  const working = blocks.map((block) => ({ ...block, lines: [...block.lines] }));

  while (working.length > max) {
    let bestIndex = 0;
    let bestGap = Infinity;
    for (let i = 1; i < working.length; i += 1) {
      const previous = working[i - 1].bbox;
      const gap = working[i].bbox.y - (previous.y + previous.height);
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }
    const target = working[bestIndex - 1];
    const source = working[bestIndex];
    const left = Math.min(target.bbox.x, source.bbox.x);
    const top = Math.min(target.bbox.y, source.bbox.y);
    const right = Math.max(
      target.bbox.x + target.bbox.width,
      source.bbox.x + source.bbox.width,
    );
    const bottom = Math.max(
      target.bbox.y + target.bbox.height,
      source.bbox.y + source.bbox.height,
    );
    target.bbox = { x: left, y: top, width: right - left, height: bottom - top };
    target.lines = [...target.lines, ...source.lines];
    target.touchesPageBottom = target.touchesPageBottom || source.touchesPageBottom;
    working.splice(bestIndex, 1);
  }

  return working.map((block, index) => ({ ...block, index }));
}

/**
 * Attach transcribed text to the CV-detected lines inside a block.
 * When the counts agree the mapping is exact; otherwise the text is spread
 * proportionally so line boxes still carry roughly the right words.
 */
function distributeLines(
  block: LayoutBlock,
  text: string,
  confidence: number,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): TranscribedLine[] {
  const textLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return block.lines.map((line, lineIndex) => {
    let lineText = "";
    if (textLines.length === block.lines.length) {
      lineText = textLines[lineIndex];
    } else if (textLines.length > 0) {
      if (block.lines.length === 1) {
        lineText = textLines.join(" ");
      } else {
        const start = Math.floor((lineIndex * textLines.length) / block.lines.length);
        const end = Math.max(
          start + 1,
          Math.floor(((lineIndex + 1) * textLines.length) / block.lines.length),
        );
        lineText = textLines.slice(start, end).join(" ");
      }
    }

    return {
      pageNumber,
      blockIndex: block.index,
      lineIndex,
      bbox: toNormalized(line.bbox, pageWidth, pageHeight),
      text: lineText,
      confidence,
    } satisfies TranscribedLine;
  });
}

export async function transcribeDocument(params: {
  bitmaps: PageBitmap[];
  mode: Mode;
  vision: VisionProvider;
  onPageStart?: (pageNumber: number, total: number) => void;
  /** Progress note while a page is being retried, so the UI is not silent. */
  onPageNote?: (pageNumber: number, total: number, note: string) => void;
}): Promise<DocumentTranscript> {
  const { bitmaps, mode, vision, onPageStart, onPageNote } = params;
  const tuning = TUNING[mode];

  const blocks: TranscribedBlock[] = [];
  const blankPages: number[] = [];
  /** Tail of the previous page's last region, for continuation detection. */
  let previousPageTail: string | undefined;

  for (const bitmap of bitmaps) {
    onPageStart?.(bitmap.pageNumber, bitmaps.length);

    const grayscale = await toGrayscale(bitmap.png);
    const layout = segmentPage(grayscale, bitmap.pageNumber, {
      blockGapFactor: tuning.blockGapFactor,
    });

    const meaningful = layout.blocks.filter((block) =>
      isMeaningful(block, layout.width, layout.height),
    );

    if (layout.inkRatio < BLANK_PAGE_INK_RATIO || meaningful.length === 0) {
      blankPages.push(bitmap.pageNumber);
      continue;
    }

    const capped = capBlocks(meaningful, tuning.maxBlocksPerPage);

    const [context, ...crops] = await Promise.all([
      pageThumbnail(bitmap.png),
      ...capped.map((block) => cropRegion(bitmap.png, block.bbox)),
    ]);

    const transcriptions = await vision[
      mode === "printed" ? "transcribePrinted" : "transcribeHandwritten"
    ]({
      pageNumber: bitmap.pageNumber,
      pageCount: bitmaps.length,
      pageContext: context,
      previousPageTail,
      onRetry: (note) => onPageNote?.(bitmap.pageNumber, bitmaps.length, note),
      regions: capped.map((block, index) => ({
        index: block.index,
        jpeg: crops[index],
      })),
    });

    const byIndex = new Map(
      transcriptions.map((transcription) => [transcription.index, transcription]),
    );

    for (const block of capped) {
      const transcription = byIndex.get(block.index);
      const text = transcription?.text ?? "";
      const confidence = transcription?.confidence ?? 0;

      blocks.push({
        pageNumber: bitmap.pageNumber,
        blockIndex: block.index,
        bbox: toNormalized(block.bbox, layout.width, layout.height),
        text,
        label: transcription?.label,
        confidence,
        isContinuation: transcription?.isContinuation ?? false,
        struckOut: transcription?.struckOut ?? false,
        touchesPageBottom: block.touchesPageBottom,
        touchesPageTop: block.touchesPageTop,
        lines: distributeLines(
          block,
          text,
          confidence,
          bitmap.pageNumber,
          layout.width,
          layout.height,
        ),
      });
    }

    const lastOnPage = blocks.at(-1);
    previousPageTail =
      lastOnPage?.pageNumber === bitmap.pageNumber && lastOnPage.text
        ? lastOnPage.text.replace(/\s+/g, " ").slice(-PAGE_TAIL_CHARS)
        : undefined;
  }

  return { blocks, blankPages };
}
