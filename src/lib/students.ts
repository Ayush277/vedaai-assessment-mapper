/**
 * Turning an uploaded file name into something a teacher would recognise.
 *
 * The file name is the only identifying information a batch upload carries —
 * nothing on a scanned sheet reliably says whose it is — so the name has to be
 * readable rather than clever. "student_1_answer_sheet.pdf" should read as
 * "Student 1", not as the raw file name.
 */

const NOISE =
  /\b(answer|answers|answersheet|sheet|sheets|scan|scanned|copy|final|submission|paper|page|pages|doc|document|img|image|photo|file|upload|uploaded)\b/gi;

const SEPARATORS = /[_\-.+]+/g;

function titleCase(value: string): string {
  return value.replace(
    /\b[\p{L}\p{N}]+/gu,
    (word) => word[0].toUpperCase() + word.slice(1).toLowerCase(),
  );
}

/**
 * @param fileName the uploaded name, e.g. "student_1_answer_sheet.pdf"
 * @param index    zero-based position in the batch, used when nothing survives
 */
export function studentNameFromFile(fileName: string, index: number): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, "");

  const cleaned = withoutExtension
    // Dates are stripped before separators are flattened — once "2024-01-15"
    // has become "2024 01 15" there is no date left to recognise.
    // Lookarounds rather than \b: an underscore is a word character, so \b
    // never fires between "15" and "_" in "2024-01-15_arjun".
    .replace(/(?<!\d)\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?!\d)/g, " ")
    .replace(SEPARATORS, " ")
    .replace(NOISE, " ")
    // A long run of digits or hex identifies a file, not a person.
    .replace(/(?<![0-9a-z])[0-9a-f]{8,}(?![0-9a-z])/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return `Student ${index + 1}`;

  // "1" on its own is a position, not a name; make that explicit.
  if (/^\d+$/.test(cleaned)) return `Student ${cleaned}`;

  const named = titleCase(cleaned);
  return named.length > 48 ? `${named.slice(0, 45).trimEnd()}…` : named;
}

/** Stable, URL-safe id for a student within one run. */
export function studentIdFor(index: number): string {
  return `s_${index + 1}`;
}
