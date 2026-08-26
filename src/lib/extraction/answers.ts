import type { Answer, AnswerRegion } from "@/lib/types/assessment";
import { parseLabel, splitLeadingLabel } from "@/lib/mapping/normalize-label";
import type { DocumentTranscript, TranscribedBlock } from "./types";

/**
 * Answer segmentation.
 *
 * The CV segmenter already split each page into blocks separated by real
 * whitespace. This turns that spatial structure plus the transcribed text into
 * discrete answers, deciding for every block whether it starts a new answer or
 * continues the previous one — including across a page break.
 */

export type AnswerExtractionResult = {
  answers: Answer[];
  warnings: string[];
};

/** A gap this large on the same page argues for a genuinely new answer. */
const LARGE_GAP_RATIO = 0.075;
/** Transcriptions below this are kept but flagged rather than trusted. */
const LOW_CONFIDENCE = 0.45;

function orderBlocks(blocks: TranscribedBlock[]): TranscribedBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    const dy = a.bbox.y - b.bbox.y;
    if (Math.abs(dy) > 0.01) return dy;
    return a.bbox.x - b.bbox.x;
  });
}

type Draft = {
  label?: string;
  normalizedLabel?: string;
  blocks: TranscribedBlock[];
  textParts: string[];
};

/**
 * Resolve the label for a block from two independent signals: what the vision
 * provider reported, and what a deterministic parse of the transcription finds.
 * Agreement is common; when only one fires we still accept it, because a
 * student writing "11(b)" is the single strongest mapping signal available.
 */
function resolveLabel(block: TranscribedBlock): {
  label?: string;
  normalized?: string;
  bodyText: string;
} {
  const providerLabel = block.label?.trim();
  const providerNormalized = parseLabel(providerLabel).normalized;

  const firstLine = block.text.split("\n", 1)[0] ?? "";
  const fromText = splitLeadingLabel(firstLine);

  if (providerNormalized) {
    // Strip the label off the body when the transcription repeats it.
    const body = fromText.normalized === providerNormalized
      ? [fromText.rest, ...block.text.split("\n").slice(1)].join("\n").trim()
      : block.text.trim();
    return { label: providerLabel, normalized: providerNormalized, bodyText: body };
  }

  if (fromText.normalized && fromText.label) {
    const body = [fromText.rest, ...block.text.split("\n").slice(1)]
      .join("\n")
      .trim();
    return { label: fromText.label, normalized: fromText.normalized, bodyText: body };
  }

  return { bodyText: block.text.trim() };
}

function startsNewAnswer(
  block: TranscribedBlock,
  previous: TranscribedBlock | undefined,
  hasLabel: boolean,
  open: Draft | null,
): boolean {
  if (hasLabel) return true;
  if (!open || !previous) return true;

  // Page break. Two independent signals can carry a continuation across it:
  // the reader recognising the text as a direct continuation, or the geometry
  // of writing that ran off the bottom of one page onto the top of the next.
  if (block.pageNumber !== previous.pageNumber) {
    if (block.isContinuation) return false;
    return !(previous.touchesPageBottom && block.touchesPageTop);
  }

  if (block.isContinuation) return false;

  const gap = block.bbox.y - (previous.bbox.y + previous.bbox.height);
  // The provider saw no continuation AND there is a wide gap: two signals
  // agreeing that the student moved on to something else.
  return gap > LARGE_GAP_RATIO;
}

function toRegion(block: TranscribedBlock): AnswerRegion {
  return { pageNumber: block.pageNumber, bbox: block.bbox };
}

export function extractAnswers(
  transcript: DocumentTranscript,
): AnswerExtractionResult {
  const warnings: string[] = [];
  const ordered = orderBlocks(transcript.blocks);

  const usable = ordered.filter((block) => {
    if (block.struckOut) return false;
    return block.text.trim().length > 0;
  });

  const struckOutCount = ordered.length - usable.length;
  if (struckOutCount > 0 && ordered.some((block) => block.struckOut)) {
    warnings.push(
      `${ordered.filter((b) => b.struckOut).length} crossed-out region(s) were ignored.`,
    );
  }

  const drafts: Draft[] = [];
  let open: Draft | null = null;
  let previous: TranscribedBlock | undefined;

  for (const block of usable) {
    const { label, normalized, bodyText } = resolveLabel(block);
    const isNew = startsNewAnswer(block, previous, Boolean(normalized), open);

    if (isNew) {
      open = {
        label,
        normalizedLabel: normalized,
        blocks: [block],
        textParts: bodyText ? [bodyText] : [],
      };
      drafts.push(open);
    } else if (open) {
      open.blocks.push(block);
      if (bodyText) open.textParts.push(bodyText);
    }

    previous = block;
  }

  const answers: Answer[] = drafts
    .map((draft, order) => {
      const blocks = draft.blocks;
      const last = blocks[blocks.length - 1];
      const pages = new Set(blocks.map((block) => block.pageNumber));
      const confidences = blocks.map((block) => block.confidence);
      const confidence =
        confidences.length > 0
          ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
          : 0;

      return {
        id: `a_${order + 1}`,
        recognizedLabel: draft.label,
        normalizedRecognizedLabel: draft.normalizedLabel,
        text: draft.textParts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        regions: blocks.map(toRegion),
        confidence: Number(confidence.toFixed(3)),
        // Content running to the bottom edge with nothing after it on a later
        // page is the classic "ran out of room" case.
        appearsIncomplete: last.touchesPageBottom && pages.size === 1,
        order,
      } satisfies Answer;
    })
    .filter((answer) => answer.text.length > 0 || answer.regions.length > 0);

  const lowConfidence = answers.filter(
    (answer) => answer.confidence > 0 && answer.confidence < LOW_CONFIDENCE,
  ).length;
  if (lowConfidence > 0) {
    warnings.push(
      `${lowConfidence} answer(s) were hard to read; their transcription may be inaccurate.`,
    );
  }

  if (transcript.blankPages.length > 0) {
    warnings.push(
      `No handwriting was detected on answer sheet page(s) ${transcript.blankPages.join(", ")}.`,
    );
  }

  return { answers, warnings };
}
