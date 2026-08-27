/**
 * Question labels are written a dozen different ways across a printed paper
 * and a student's answer sheet. Everything is reduced to one canonical form so
 * "Q11 (a)", "11-A", "Question 11(a)" and "11a" all compare equal.
 *
 * Canonical form: main number + optional sub-part, lower-case, no separators.
 *   "11 (a)"        -> "11a"
 *   "Q5(ii)"        -> "5ii"
 *   "Section B - 4" -> "4"
 *   "Ans. 12"       -> "12"
 */

export type ParsedLabel = {
  /** Canonical comparable form, e.g. "11a". Empty when nothing parseable. */
  normalized: string;
  /** Main question number as a string, e.g. "11". */
  main: string;
  /** Sub-part without brackets, e.g. "a" or "ii". Undefined when absent. */
  sub?: string;
  /** Canonical label of the parent question when this is a sub-part. */
  parent?: string;
};

const ROMAN = /^(?:x{0,3})(?:ix|iv|v?i{0,3})$/;

/** Noise words that precede a real label on answer sheets and question papers. */
const PREFIX_NOISE =
  /^\s*(?:section\s+[a-z0-9]+\s*[-–—:.]?\s*|part\s+[a-z0-9]+\s*[-–—:.]?\s*|ans(?:wer)?\s*[.:-]?\s*|sol(?:ution)?\s*[.:-]?\s*|q(?:uestion|ues|no)?\s*[.:-]?\s*|no\.?\s*)+/gi;

/** OCR look-alikes, applied only when a token otherwise fails to parse. */
const OCR_DIGIT_SUBSTITUTIONS: Record<string, string> = {
  l: "1",
  i: "1",
  I: "1",
  O: "0",
  o: "0",
  S: "5",
  s: "5",
  Z: "2",
  z: "2",
  B: "8",
  G: "6",
  g: "9",
  q: "9",
};

function stripNoise(raw: string): string {
  let text = raw.trim();
  let previous = "";
  // Repeat because "Section B - Q4" carries two layers of noise.
  while (text !== previous) {
    previous = text;
    text = text.replace(PREFIX_NOISE, "").trim();
  }
  return text;
}

function canonicalSub(raw: string): string | undefined {
  const sub = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!sub) return undefined;
  // Roman numerals stay as written; single letters stay as written. Both are
  // already unique within their parent question.
  return sub;
}

function parseFrom(text: string): ParsedLabel | null {
  // Anchor on the question number first; everything after it is optional.
  const head = text.match(/^(\d{1,3})/);
  if (!head) return null;

  const main = String(Number(head[1]));
  const tail = text.slice(head[1].length);

  // A bracketed sub-part: "11(a)", "11 (ii)", "11[b]".
  //
  // The closing bracket is optional because handwriting OCR loses it
  // constantly — a bracket is a thin stroke, and "11 (b" is read far more often
  // than "11 (b)". Without this the sub-part is dropped and the answer collapses
  // onto its parent question, which then looks confidently answered while the
  // real sub-parts read as blank.
  const bracketed = tail.match(
    /^\s*[([]\s*([a-zA-Z]{1,4})\s*(?:[)\]]|(?![a-zA-Z]))/,
  );
  if (bracketed) {
    const sub = canonicalSub(bracketed[1]);
    if (sub) {
      return { normalized: `${main}${sub}`, main, sub, parent: main };
    }
  }

  // An attached or separator-joined sub-part: "11a", "11.a", "11-A", "11:ii".
  // Crucially there must be NO whitespace before it — "11 What is..." is a
  // question number followed by its text, not question 11(w).
  const attached = tail.match(/^[.)\-–—:]?\s{0,1}([a-zA-Z]{1,4})(?![a-zA-Z])/);
  if (attached) {
    const sub = canonicalSub(attached[1]);
    // Only a single letter or a roman numeral is credible without brackets.
    if (sub && (sub.length === 1 || ROMAN.test(sub))) {
      return { normalized: `${main}${sub}`, main, sub, parent: main };
    }
  }

  return { normalized: main, main };
}

export function parseLabel(raw: string | undefined | null): ParsedLabel {
  if (!raw) return { normalized: "", main: "" };

  const cleaned = stripNoise(String(raw));
  const direct = parseFrom(cleaned);
  if (direct) return direct;

  // Second pass: repair common OCR digit/letter confusions and retry once.
  // Only the leading number-shaped token is touched, so question text is safe.
  const repaired = cleaned.replace(/^[a-zA-Z0-9]{1,4}/, (token) =>
    /^\d+$/.test(token)
      ? token
      : token
          .split("")
          .map((char) => OCR_DIGIT_SUBSTITUTIONS[char] ?? char)
          .join(""),
  );
  if (repaired !== cleaned) {
    const repairedParse = parseFrom(repaired);
    if (repairedParse) return repairedParse;
  }

  return { normalized: "", main: "" };
}

export function normalizeLabel(raw: string | undefined | null): string {
  return parseLabel(raw).normalized;
}

/**
 * Detect a label at the start of a line and return it plus the remaining text.
 * Used to split "11 (a) Explain normalization." into label and question body.
 */
export function splitLeadingLabel(line: string): {
  label?: string;
  normalized: string;
  rest: string;
} {
  const trimmed = line.trim();
  const match = trimmed.match(
    /^((?:section\s+[a-z0-9]+\s*[-–—:.]?\s*)?(?:part\s+[a-z0-9]+\s*[-–—:.]?\s*)?(?:ans(?:wer)?\s*[.:-]?\s*)?(?:q(?:uestion|ues|no)?\s*[.:-]?\s*)?\d{1,3}\s*(?:[([]\s*[a-zA-Z]{1,4}\s*[)\]]?|[.)\-–—:]\s*[a-zA-Z]\)|[.)\-–—:])?)\s*/i,
  );

  if (!match) return { normalized: "", rest: trimmed };

  const rawLabel = match[1].trim();
  const parsed = parseLabel(rawLabel);
  if (!parsed.normalized) return { normalized: "", rest: trimmed };

  // A bare number followed by nothing is not a label, it is a stray digit.
  const rest = trimmed.slice(match[0].length).trim();

  return { label: rawLabel, normalized: parsed.normalized, rest };
}

/** Sort key that keeps 2 before 10 and 11a before 11b. */
export function labelSortKey(normalized: string): [number, string] {
  const match = normalized.match(/^(\d+)(.*)$/);
  if (!match) return [Number.MAX_SAFE_INTEGER, normalized];
  return [Number(match[1]), match[2] ?? ""];
}
