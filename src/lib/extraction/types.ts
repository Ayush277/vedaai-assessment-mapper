import type { NormalizedBoundingBox } from "@/lib/types/assessment";

/** One detected text line with its real, CV-derived coordinates. */
export type TranscribedLine = {
  pageNumber: number;
  blockIndex: number;
  /** Index of this line inside its block. */
  lineIndex: number;
  bbox: NormalizedBoundingBox;
  text: string;
  confidence: number;
};

/** A contiguous region of content on one page, as read by the vision provider. */
export type TranscribedBlock = {
  pageNumber: number;
  blockIndex: number;
  bbox: NormalizedBoundingBox;
  text: string;
  /** Label the writer put at the start of this block, verbatim. */
  label?: string;
  confidence: number;
  isContinuation: boolean;
  struckOut: boolean;
  touchesPageBottom: boolean;
  touchesPageTop: boolean;
  lines: TranscribedLine[];
};

export type DocumentTranscript = {
  blocks: TranscribedBlock[];
  /** Pages that produced no readable content, for user-facing warnings. */
  blankPages: number[];
};
