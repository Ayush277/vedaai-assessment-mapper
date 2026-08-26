import type {
  Degradation,
  DegradationKind,
  Question,
} from "@/lib/types/assessment";
import { describeDegradation, type ReasoningProvider } from "@/lib/ai/provider";
import { QUESTION_STRUCTURE_SYSTEM } from "@/lib/ai/prompts";
import { asArray, asNumber, asString, extractJson } from "@/lib/ai/json";
import { unionNormalized } from "@/lib/vision/segmentation";
import { parseLabel, splitLeadingLabel } from "@/lib/mapping/normalize-label";
import type { DocumentTranscript, TranscribedLine } from "./types";

/**
 * Question extraction runs deterministically first and only then asks a model
 * to fill gaps. The printed order is taken from page number and vertical
 * position — never from the order the model happens to emit — so the UI can
 * never reorder a paper based on AI output.
 */

const SECTION_PATTERN = /^\s*(section|part)\s+([a-z0-9]{1,4})\b\s*[-–—:.]?\s*(.*)$/i;
const MARKS_PATTERNS = [
  /\[\s*(\d{1,3})\s*(?:marks?|m)?\s*\]/i,
  /\(\s*(\d{1,3})\s*marks?\s*\)/i,
  /\b(\d{1,3})\s*marks?\b/i,
];

/** Lines shorter than this after label removal are treated as noise/headers. */
const MIN_QUESTION_TEXT = 3;

const HEADER_NOISE =
  /^(page\s*\d+|\d+\s*of\s*\d+|time\s*[:\-]|max(?:imum)?\s*marks|general\s+instructions?|all\s+questions?\s+are|answer\s+(?:all|any)\b)/i;

export type QuestionExtractionResult = {
  questions: Question[];
  warnings: string[];
  degradations: Degradation[];
};

/**
 * A question label starting part-way along a line. Requires a capitalised word
 * or bracket after it, so "= 22/7 x 7 x 7" is never treated as a new question.
 */
const QUESTION_START_TOKEN =
  /(?:Q\s*)?\d{1,3}\s*(?:\([a-zA-Z]{1,4}\)|[.)])\s+[A-Z(]/g;

/** Characters that can legitimately close the previous question. Marks are
 *  printed as "[3]" or "(3 marks)", so a closing bracket ends a question too. */
const QUESTION_BOUNDARY_BEFORE = /[.?!\])]/;

/**
 * Offsets inside `text` where a new question begins. Index 0 is excluded: the
 * line's own leading label is handled by the normal parser.
 */
export function findInlineQuestionStarts(text: string): number[] {
  const starts: number[] = [];
  QUESTION_START_TOKEN.lastIndex = 0;

  for (const match of text.matchAll(QUESTION_START_TOKEN)) {
    const index = match.index ?? 0;
    if (index === 0) continue;

    // Look back past whitespace and any trailing marks annotation.
    const before = text
      .slice(0, index)
      .replace(/\s*(?:\[\s*\d{1,3}\s*(?:marks?|m)?\s*\]|\(\s*\d{1,3}\s*marks?\s*\))\s*$/i, "")
      .trimEnd();

    if (before.length === 0) continue;
    if (!QUESTION_BOUNDARY_BEFORE.test(before.slice(-1))) continue;
    // There must be whitespace immediately before the label.
    if (!/\s/.test(text[index - 1] ?? "")) continue;

    starts.push(index);
  }

  return starts;
}

/**
 * Tightly set papers often place the end of one question and the start of the
 * next on a single OCR line. Split those apart, apportioning the line's box
 * horizontally by character count so each question keeps a usable region.
 */
function splitInlineQuestions(line: TranscribedLine): TranscribedLine[] {
  const text = line.text.trim();
  if (text.length === 0) return [line];

  const starts = findInlineQuestionStarts(text);
  if (starts.length === 0) return [line];

  const boundaries = [0, ...starts, text.length];
  const parts: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const part = text.slice(boundaries[i], boundaries[i + 1]).trim();
    if (part) parts.push(part);
  }
  if (parts.length < 2) return [line];

  const totalChars = parts.reduce((sum, part) => sum + part.length, 0);
  let consumed = 0;

  return parts.map((part, index) => {
    const start = consumed / totalChars;
    consumed += part.length;
    const end = consumed / totalChars;
    return {
      ...line,
      lineIndex: line.lineIndex * 100 + index,
      text: part,
      bbox: {
        x: line.bbox.x + line.bbox.width * start,
        y: line.bbox.y,
        width: line.bbox.width * (end - start),
        height: line.bbox.height,
      },
    } satisfies TranscribedLine;
  });
}

function flattenLines(transcript: DocumentTranscript): TranscribedLine[] {
  return transcript.blocks
    .flatMap((block) => block.lines)
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      // Same page: top-to-bottom, then left-to-right for side-by-side columns.
      const dy = a.bbox.y - b.bbox.y;
      if (Math.abs(dy) > 0.008) return dy;
      return a.bbox.x - b.bbox.x;
    })
    .flatMap(splitInlineQuestions);
}

function detectMarks(text: string): number | undefined {
  for (const pattern of MARKS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const marks = Number(match[1]);
      if (Number.isFinite(marks) && marks > 0 && marks <= 100) return marks;
    }
  }
  return undefined;
}

function stripMarks(text: string): string {
  let result = text;
  for (const pattern of MARKS_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function questionIdFor(normalized: string, seen: Set<string>): string {
  const base = `q_${normalized.replace(/[^a-z0-9]/gi, "_") || "x"}`;
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let suffix = 2;
  while (seen.has(`${base}_${suffix}`)) suffix += 1;
  const id = `${base}_${suffix}`;
  seen.add(id);
  return id;
}

type Draft = {
  label: string;
  normalized: string;
  startLine: number;
  endLine: number;
  section?: string;
  marks?: number;
  textParts: string[];
};

/** Step 1 — deterministic pass over the ordered OCR lines. */
function deterministicPass(lines: TranscribedLine[]): Draft[] {
  const drafts: Draft[] = [];
  let currentSection: string | undefined;
  let current: Draft | null = null;

  lines.forEach((line, index) => {
    const text = line.text.trim();
    if (!text) return;

    const sectionMatch = text.match(SECTION_PATTERN);
    if (sectionMatch && sectionMatch[3].trim().length < 60) {
      currentSection = `${sectionMatch[1][0].toUpperCase()}${sectionMatch[1]
        .slice(1)
        .toLowerCase()} ${sectionMatch[2].toUpperCase()}`;
      // A section heading may still carry the first question on the same line.
      const remainder = sectionMatch[3].trim();
      if (!remainder) return;
    }

    const { label, normalized, rest } = splitLeadingLabel(text);

    const startsQuestion =
      Boolean(label && normalized) &&
      // "12" alone on a line is a page number, not a question.
      (rest.length >= MIN_QUESTION_TEXT || Boolean(current)) &&
      !HEADER_NOISE.test(text);

    if (startsQuestion && label && normalized) {
      if (current) {
        current.endLine = index - 1;
        drafts.push(current);
      }
      current = {
        label: label.replace(/\s+/g, " ").trim(),
        normalized,
        startLine: index,
        endLine: index,
        section: currentSection,
        marks: detectMarks(text),
        textParts: [stripMarks(rest)],
      };
      return;
    }

    if (current) {
      if (HEADER_NOISE.test(text)) return;
      current.marks = current.marks ?? detectMarks(text);
      current.textParts.push(stripMarks(text));
      current.endLine = index;
    }
  });

  if (current) {
    (current as Draft).endLine = lines.length - 1;
    drafts.push(current);
  }

  return drafts.filter(
    (draft) => draft.textParts.join(" ").trim().length >= MIN_QUESTION_TEXT,
  );
}

/**
 * Step 2 — model pass. The model only sees numbered plain-text lines (cheap,
 * no images) and returns structure. It may ADD questions the regex missed and
 * enrich marks/section/parent, but it never overrides a label the
 * deterministic pass already resolved from the printed text.
 */
async function structuringPass(
  lines: TranscribedLine[],
  drafts: Draft[],
  reasoning: ReasoningProvider,
): Promise<{ drafts: Draft[]; degradedBecause?: DegradationKind }> {
  const numbered = lines
    .map((line, index) => `${index}: ${line.text.trim()}`)
    .filter((line) => line.split(": ").slice(1).join(": ").length > 0)
    .join("\n");

  if (!numbered.trim()) return { drafts };

  const response = await reasoning.completeJson({
    system: QUESTION_STRUCTURE_SYSTEM,
    prompt: `Lines from the question paper, in printed order:\n\n${numbered.slice(
      0,
      60_000,
    )}`,
    maxOutputTokens: 8192,
  });

  if (!response.ok) return { drafts, degradedBecause: response.kind };

  const parsed = extractJson(JSON.stringify(response.value));
  const rows = asArray(
    parsed && typeof parsed === "object" && "questions" in (parsed as object)
      ? (parsed as { questions: unknown }).questions
      : parsed,
  );
  if (rows.length === 0) return { drafts, degradedBecause: "unusable_response" };

  const byNormalized = new Map(drafts.map((draft) => [draft.normalized, draft]));
  const additions: Draft[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const rawLabel = asString(record.label).trim();
    const normalized = parseLabel(rawLabel).normalized;
    if (!normalized) continue;

    const startLine = asNumber(record.startLine, -1);
    const endLine = asNumber(record.endLine, startLine);
    const marks = asNumber(record.marks, Number.NaN);
    const section = asString(record.section).trim() || undefined;

    const existing = byNormalized.get(normalized);
    if (existing) {
      // Enrich only. Label, text and order stay as printed.
      if (!existing.marks && Number.isFinite(marks) && marks > 0) {
        existing.marks = marks;
      }
      if (!existing.section && section) existing.section = section;
      continue;
    }

    // A question the deterministic pass missed entirely.
    if (
      Number.isInteger(startLine) &&
      startLine >= 0 &&
      startLine < lines.length
    ) {
      const safeEnd = Math.min(
        lines.length - 1,
        Math.max(startLine, Number.isInteger(endLine) ? endLine : startLine),
      );
      const body = lines
        .slice(startLine, safeEnd + 1)
        .map((line) => line.text.trim())
        .join(" ");
      const { rest } = splitLeadingLabel(body);
      const text = stripMarks(rest || body);
      if (text.length >= MIN_QUESTION_TEXT) {
        const draft: Draft = {
          label: rawLabel,
          normalized,
          startLine,
          endLine: safeEnd,
          section,
          marks: Number.isFinite(marks) && marks > 0 ? marks : undefined,
          textParts: [text],
        };
        additions.push(draft);
        byNormalized.set(normalized, draft);
      }
    }
  }

  return { drafts: [...drafts, ...additions] };
}

export async function extractQuestions(
  transcript: DocumentTranscript,
  reasoning: ReasoningProvider | null,
): Promise<QuestionExtractionResult> {
  const warnings: string[] = [];
  const degradations: Degradation[] = [];
  const lines = flattenLines(transcript);

  if (lines.length === 0) {
    return {
      questions: [],
      warnings: ["The question paper had no readable text."],
      degradations,
    };
  }

  let drafts = deterministicPass(lines);
  const deterministicCount = drafts.length;

  if (reasoning) {
    try {
      const result = await structuringPass(lines, drafts, reasoning);
      drafts = result.drafts;
      if (result.degradedBecause) {
        degradations.push({
          step: "question-structuring",
          kind: result.degradedBecause,
          message: describeDegradation(
            result.degradedBecause,
            "the AI check on question boundaries",
          ),
        });
      }
    } catch {
      warnings.push(
        "The question structuring step failed; falling back to layout-only detection.",
      );
    }
  } else {
    degradations.push({
      step: "question-structuring",
      kind: "not_configured",
      message: describeDegradation(
        "not_configured",
        "the AI check on question boundaries",
      ),
    });
  }

  if (drafts.length === 0) {
    return {
      questions: [],
      warnings: [
        ...warnings,
        "No numbered questions were found in the question paper.",
      ],
      degradations,
    };
  }

  if (drafts.length > deterministicCount) {
    warnings.push(
      `${drafts.length - deterministicCount} question(s) were recovered by AI structuring and may need a quick check.`,
    );
  }

  // Printed order = position of the first line, not model output order.
  drafts.sort((a, b) => a.startLine - b.startLine);

  const seenIds = new Set<string>();
  const byNormalized = new Map<string, string>();

  const questions: Question[] = drafts.map((draft, order) => {
    const draftLines = lines.slice(draft.startLine, draft.endLine + 1);
    const firstLine = draftLines[0] ?? lines[draft.startLine];
    const pageNumber = firstLine?.pageNumber ?? 1;
    // Only union boxes from the page the question starts on; a question that
    // wraps pages is still anchored where the teacher will look for it.
    const bbox =
      unionNormalized(
        draftLines
          .filter((line) => line.pageNumber === pageNumber)
          .map((line) => line.bbox),
      ) ?? undefined;

    const parsed = parseLabel(draft.label);
    const id = questionIdFor(draft.normalized, seenIds);
    byNormalized.set(draft.normalized, id);

    return {
      id,
      label: draft.label,
      normalizedLabel: draft.normalized,
      text: draft.textParts.join(" ").replace(/\s{2,}/g, " ").trim(),
      pageNumber,
      bbox,
      marks: draft.marks,
      section: draft.section,
      parentId: parsed.parent,
      order,
    };
  });

  // Resolve parent labels to real question ids now that all ids exist.
  for (const question of questions) {
    if (question.parentId) {
      question.parentId = byNormalized.get(question.parentId);
    }
  }

  return { questions, warnings, degradations };
}
