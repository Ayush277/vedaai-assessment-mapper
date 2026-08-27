import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { AssessmentResult, StudentResult } from "@/lib/types/assessment";
import { buildQuestionRows, gradeBand, improvementsFrom, strengthsFrom, summariseGrades } from "@/lib/view-model";
import type { QuestionRow } from "@/lib/view-model";
import type { ReviewEdit } from "@/lib/types/assessment";

/**
 * The evaluation report as a PDF a teacher can file, print or send home.
 *
 * Built in the browser rather than on the server: the marks that matter are the
 * teacher's edits, which live in this tab and have never been sent anywhere. A
 * server round-trip would either miss them or mean posting the whole result —
 * page images included — back up the wire to get them.
 *
 * The palette is the product's own, so a printed report and the screen it came
 * from read as the same document.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.086, 0.094, 0.114);
const MUTED = rgb(0.486, 0.51, 0.549);
const LINE = rgb(0.906, 0.906, 0.918);
const BRAND = rgb(1, 0.353, 0.149);
const GREEN = rgb(0.059, 0.616, 0.31);
const AMBER = rgb(0.761, 0.463, 0.039);
const RED = rgb(0.863, 0.231, 0.231);

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Split text to fit a width, breaking long words rather than overflowing. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    // A single token wider than the column, e.g. an unbroken formula.
    let chunk = "";
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

class Layout {
  private page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly onNewPage: (page: PDFPage) => void,
  ) {
    this.page = doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
    this.onNewPage(this.page);
  }

  get current(): PDFPage {
    return this.page;
  }

  get contentWidth(): number {
    return A4.width - MARGIN * 2;
  }

  /** Start a new page when the next block would not fit. */
  ensure(space: number): void {
    if (this.y - space >= MARGIN + 28) return;
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
    this.onNewPage(this.page);
  }

  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      x?: number;
      width?: number;
      lineHeight?: number;
    } = {},
  ): void {
    const {
      size = 10,
      bold = false,
      color = INK,
      x = MARGIN,
      width = this.contentWidth,
      lineHeight = size * 1.45,
    } = options;
    const font = bold ? this.fonts.bold : this.fonts.regular;

    for (const line of wrap(value, font, size, width)) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= lineHeight;
    }
  }

  rule(gap = 10): void {
    this.ensure(gap + 1);
    this.y -= gap / 2;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: LINE,
    });
    this.y -= gap / 2;
  }

  gap(space: number): void {
    this.y -= space;
  }
}

function toneFor(percentage: number) {
  if (percentage >= 75) return GREEN;
  if (percentage >= 40) return AMBER;
  return RED;
}

const VERDICT_LABEL: Record<string, string> = {
  correct: "Correct",
  partial: "Partial",
  incorrect: "Incorrect",
  not_attempted: "Unanswered",
};

function drawStudent(
  layout: Layout,
  fonts: Fonts,
  result: AssessmentResult,
  student: StudentResult,
  rows: QuestionRow[],
): void {
  const summary = summariseGrades(rows, student.gradingSummary);
  const band = summary ? gradeBand(summary.percentage) : null;
  const tone = summary ? toneFor(summary.percentage) : MUTED;
  const editedCount = rows.filter((row) => row.isEdited).length;

  /* ------------------------------- header ------------------------------- */
  layout.text("EVALUATION REPORT", { size: 8, bold: true, color: BRAND });
  layout.gap(2);
  layout.text(student.name, { size: 20, bold: true });
  layout.text(result.questionPaper.fileName, { size: 9, color: MUTED });
  layout.gap(6);
  layout.rule(8);

  /* -------------------------------- score ------------------------------- */
  if (summary && band) {
    const page = layout.current;
    layout.ensure(56);

    page.drawText(`${summary.marksObtained}`, {
      x: MARGIN,
      y: layout.y - 26,
      size: 28,
      font: fonts.bold,
      color: tone,
    });
    const obtainedWidth = fonts.bold.widthOfTextAtSize(`${summary.marksObtained}`, 28);
    page.drawText(` / ${summary.maxMarks}`, {
      x: MARGIN + obtainedWidth,
      y: layout.y - 26,
      size: 14,
      font: fonts.regular,
      color: MUTED,
    });
    page.drawText(`${summary.percentage}%   Grade ${band.letter}   ${band.label}`, {
      x: MARGIN + obtainedWidth + 52,
      y: layout.y - 22,
      size: 11,
      font: fonts.bold,
      color: tone,
    });

    // Progress bar, so the score reads at a glance on paper too.
    const barY = layout.y - 40;
    const barWidth = layout.contentWidth;
    page.drawRectangle({ x: MARGIN, y: barY, width: barWidth, height: 5, color: LINE });
    page.drawRectangle({
      x: MARGIN,
      y: barY,
      width: Math.max(3, (barWidth * summary.percentage) / 100),
      height: 5,
      color: tone,
    });
    layout.y -= 56;

    const counts = {
      correct: rows.filter((r) => r.grade?.evaluation === "correct").length,
      partial: rows.filter((r) => r.grade?.evaluation === "partial").length,
      incorrect: rows.filter((r) => r.grade?.evaluation === "incorrect").length,
      unanswered: rows.filter((r) => r.grade?.evaluation === "not_attempted").length,
    };
    layout.text(
      `Correct ${counts.correct}  ·  Partial ${counts.partial}  ·  Incorrect ${counts.incorrect}  ·  Unanswered ${counts.unanswered}`,
      { size: 9.5, bold: true, color: MUTED },
    );
    if (editedCount > 0) {
      layout.text(
        `${editedCount} question${editedCount === 1 ? "" : "s"} reviewed and adjusted by the teacher.`,
        { size: 9, color: BRAND },
      );
    }
  } else {
    layout.text(
      "Automatic evaluation did not run for this student, so no marks were awarded.",
      { size: 10, color: MUTED },
    );
  }

  layout.gap(4);
  layout.rule(8);

  /* ----------------------------- question list --------------------------- */
  layout.text("Question-wise evaluation", { size: 12, bold: true });
  layout.gap(6);

  for (const row of rows) {
    layout.ensure(46);
    const label = row.question.label.replace(/[.:]$/, "");
    const marks = row.grade
      ? `${row.grade.marksObtained}/${row.grade.maxMarks}`
      : "—";
    const verdict = row.grade
      ? (VERDICT_LABEL[row.grade.evaluation] ?? row.grade.evaluation)
      : row.mapping.status === "unanswered"
        ? "Unanswered"
        : "Not graded";

    const heading = `Q${label}  ·  ${marks} marks  ·  ${verdict}${
      row.isEdited ? "  ·  edited by teacher" : ""
    }`;
    layout.text(heading, {
      size: 10,
      bold: true,
      color: row.grade
        ? row.grade.evaluation === "correct"
          ? GREEN
          : row.grade.evaluation === "not_attempted" ||
              row.grade.evaluation === "incorrect"
            ? RED
            : AMBER
        : MUTED,
    });
    layout.text(row.question.text, { size: 9, color: INK, width: layout.contentWidth });

    if (row.answer?.text) {
      layout.text(`Answer: ${row.answer.text.replace(/\n+/g, " ")}`, {
        size: 8.5,
        color: MUTED,
      });
    } else {
      layout.text("Answer: not found on the sheet.", { size: 8.5, color: MUTED });
    }

    if (row.grade?.feedback) {
      layout.text(`Feedback: ${row.grade.feedback}`, { size: 8.5, color: INK });
    }

    layout.gap(6);
  }

  /* ------------------------- strengths / improvements --------------------- */
  const strengths = strengthsFrom(rows);
  const improvements = improvementsFrom(rows, student.gradingSummary);

  layout.rule(8);
  layout.text("Strengths", { size: 11, bold: true, color: GREEN });
  if (strengths.length === 0) {
    layout.text("No question was fully correct.", { size: 9, color: MUTED });
  } else {
    for (const item of strengths) layout.text(`•  ${item}`, { size: 9 });
  }

  layout.gap(6);
  layout.text("Areas to improve", { size: 11, bold: true, color: AMBER });
  if (improvements.length === 0) {
    layout.text("Nothing outstanding — every question scored full marks.", {
      size: 9,
      color: MUTED,
    });
  } else {
    for (const item of improvements) layout.text(`•  ${item}`, { size: 9 });
  }

  if (student.gradingSummary?.summary) {
    layout.gap(6);
    layout.text("Overall feedback", { size: 11, bold: true });
    layout.text(student.gradingSummary.summary, { size: 9 });
  }
}

export type PdfInput = {
  result: AssessmentResult;
  /** Teacher edits, so the PDF carries the marks actually in force. */
  edits: Record<string, Record<string, ReviewEdit>>;
  /** Omit to export the whole class. */
  student?: StudentResult;
};

export async function buildEvaluationPdf({
  result,
  edits,
  student,
}: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const students = student ? [student] : result.students;
  const stamp = new Date().toLocaleString();
  const pages: PDFPage[] = [];

  students.forEach((entry, index) => {
    const rows = buildQuestionRows(result, entry, edits[entry.id] ?? {});
    // Each student starts on a fresh page so a report can be handed out alone.
    const layout =
      index === 0
        ? new Layout(doc, fonts, (page) => pages.push(page))
        : new Layout(doc, fonts, (page) => pages.push(page));
    drawStudent(layout, fonts, result, entry, rows);
  });

  // Footer on every page, added last so it cannot be pushed around by content.
  pages.forEach((page, index) => {
    page.drawText(
      `VedaAI · generated ${stamp}${students.length > 1 ? "" : ` · ${students[0]?.name ?? ""}`}`,
      { x: MARGIN, y: MARGIN - 16, size: 7.5, font: fonts.regular, color: MUTED },
    );
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: A4.width - MARGIN - fonts.regular.widthOfTextAtSize(label, 7.5),
      y: MARGIN - 16,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
  });

  doc.setTitle(
    student ? `Evaluation report — ${student.name}` : "Evaluation reports",
  );
  doc.setProducer("VedaAI");
  return doc.save();
}

/** File-name-safe version of a student's name. */
export function reportFileName(student?: StudentResult): string {
  if (!student) return "evaluation-reports.pdf";
  const safe = student.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  return `evaluation-report-${safe || "student"}.pdf`;
}
