/**
 * Generates realistic test fixtures for the end-to-end pipeline check.
 *
 * These are inputs, not outputs: they are fed through the same upload flow a
 * teacher uses. The answer sheet deliberately contains every edge case the
 * assignment calls out — answers out of order, a skipped question, an answer
 * that runs onto the next page, and an answer labelled with a question number
 * that does not exist on the paper.
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

GlobalFonts.registerFromPath(
  "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
  "HandWriting",
);

const W = 1240;
const H = 1754; // A4 at ~150dpi
const OUT = path.resolve("fixtures");

/* --------------------------------- paper --------------------------------- */

const QUESTIONS = [
  { label: "1.", text: "Define an ecosystem and name its two main components.", marks: 2 },
  { label: "2.", text: "Which blood vessel carries blood away from the heart?", marks: 2 },
  { label: "3.", text: "Explain the role of chloroplasts in photosynthesis, naming", text2: "the main pigment involved.", marks: 3 },
  { label: "4.", text: "Describe the flow of blood through the human heart, starting", text2: "at the right atrium and ending at the aorta.", marks: 4 },
  { label: "5.", text: "State Newton's first law of motion.", marks: 2 },
  { label: "6.", text: "Draw a labelled diagram of an alveolus showing capillaries.", marks: 3 },
  { section: "Section B" },
  { label: "7.", text: "Explain the complete process of photosynthesis in green", text2: "plants, including both the light and dark reactions.", marks: 6 },
  { label: "8.", text: "What is osmosis? Give one example from plant cells.", marks: 3 },
  { label: "9.", text: "Name the enzyme that digests starch in the mouth.", marks: 1 },
  { label: "10.", text: "Explain why the human digestive system needs villi.", marks: 3 },
  { label: "11.", text: "Answer both parts of this question.", marks: null },
  { label: "11 (a)", text: "Explain the process of normalization in databases.", marks: 4 },
  { label: "11 (b)", text: "Give one example of a table in second normal form.", marks: 2 },
  { label: "12.", text: "Calculate the area of a circle whose radius is 7 cm.", marks: 3 },
];

function newPage(background = "#ffffff") {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx };
}

function renderQuestionPaper() {
  const pages = [];
  let { canvas, ctx } = newPage();
  let y = 120;

  const header = (context) => {
    context.fillStyle = "#111111";
    context.font = "bold 34px Helvetica";
    context.textAlign = "center";
    context.fillText("Class 10 — Biology & Science Unit Test", W / 2, 70);
    context.font = "20px Helvetica";
    context.fillText("Time: 2 hours          Maximum Marks: 38", W / 2, 104);
    context.textAlign = "left";
  };
  header(ctx);

  for (const entry of QUESTIONS) {
    if (y > H - 160) {
      pages.push(canvas);
      ({ canvas, ctx } = newPage());
      y = 110;
    }

    if (entry.section) {
      ctx.fillStyle = "#111111";
      ctx.font = "bold 26px Helvetica";
      ctx.fillText(entry.section, 90, y + 40);
      y += 90;
      continue;
    }

    ctx.fillStyle = "#111111";
    ctx.font = "22px Helvetica";
    ctx.fillText(`${entry.label} ${entry.text}`, 90, y);
    if (entry.text2) {
      ctx.fillText(entry.text2, 128, y + 32);
    }
    if (entry.marks) {
      ctx.textAlign = "right";
      ctx.fillText(`[${entry.marks}]`, W - 90, y);
      ctx.textAlign = "left";
    }
    y += entry.text2 ? 96 : 64;
  }
  pages.push(canvas);
  return pages;
}

/* ------------------------------ answer sheet ----------------------------- */

/** Ruled paper with a red margin, like a real school answer booklet. */
function ruledPage() {
  const { canvas, ctx } = newPage("#fdfdf7");
  ctx.strokeStyle = "#cfd8e8";
  ctx.lineWidth = 1.5;
  for (let y = 120; y < H - 60; y += 46) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(W - 70, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#e8b4b8";
  ctx.beginPath();
  ctx.moveTo(140, 60);
  ctx.lineTo(140, H - 60);
  ctx.stroke();
  return { canvas, ctx };
}

/**
 * Each entry is one handwritten block. `gap` controls the whitespace before
 * the block, which is what the layout segmenter keys off to separate answers.
 */
const ANSWER_BLOCKS = [
  {
    page: 1,
    label: "1.",
    lines: [
      "An ecosystem is a community of living",
      "organisms together with the non living",
      "parts of their environment. Its two main",
      "components are biotic and abiotic factors.",
    ],
  },
  {
    page: 1,
    label: "3.",
    lines: [
      "Chloroplasts are the organelles where",
      "photosynthesis happens. They contain the",
      "green pigment chlorophyll which absorbs",
      "light energy from the sun.",
    ],
  },
  {
    page: 1,
    label: "2.",
    lines: [
      "The artery carries blood away from the",
      "heart. The aorta is the largest artery.",
    ],
  },
  {
    page: 2,
    label: "5.",
    lines: [
      "An object stays at rest or keeps moving",
      "in a straight line unless an outside force",
      "acts on it. This is also called inertia.",
    ],
  },
  {
    page: 2,
    label: "7.",
    lines: [
      "Photosynthesis is the process used by green",
      "plants to convert light energy into chemical",
      "energy. It happens in the chloroplast of the",
      "plant cell and it has two main stages that",
      "follow one after the other. In the light",
      "reaction the chlorophyll pigment captures",
      "light energy from the sun and uses it to",
      "split water molecules. This releases oxygen",
      "gas as a waste product, which the plant lets",
      "out through the stomata on its leaves. The",
      "light energy that has been captured is then",
      "converted and carried forward to the next",
      "stage of the process. The chlorophyll sits",
      "inside the thylakoid membranes which are",
      "stacked into grana inside the chloroplast,",
      "and this stacking gives a very large surface",
      "area for capturing as much sunlight as the",
      "leaf possibly can during the day. Water is",
      "drawn up from the roots through the xylem",
      "vessels and carbon dioxide enters the leaf",
      "through the stomata, so both raw materials",
      "reach the chloroplast. The light reaction",
      "must finish before the second stage can",
      "begin, and the products it makes are",
    ],
    runsToBottom: true,
  },
  // Continuation of question 7 at the top of page 3, with no label.
  {
    page: 3,
    lines: [
      "stored as ATP and NADPH. In the dark reaction",
      "the plant uses that stored energy to fix carbon",
      "dioxide into glucose. The overall equation is",
      "6CO2 + 6H2O gives C6H12O6 + 6O2.",
    ],
    startsAtTop: true,
  },
  {
    page: 3,
    label: "11(b)",
    lines: [
      "A student table with roll no as the key and",
      "only student facts in it is in 2NF because",
      "every column depends on the whole key.",
    ],
  },
  {
    page: 3,
    label: "11(a)",
    lines: [
      "Normalization is the process of organising",
      "the columns and tables of a database so",
      "that redundancy is removed and the data",
      "stays consistent.",
    ],
  },
  {
    page: 4,
    label: "12.",
    lines: [
      "Area = pi r squared",
      "= 22/7 x 7 x 7",
      "= 154 square cm",
    ],
  },
  // Labelled 18, which does not exist on the paper -> must show as unmatched.
  {
    page: 4,
    label: "18.",
    lines: [
      "The mitochondria is called the powerhouse",
      "of the cell because it releases energy.",
    ],
  },
  {
    page: 4,
    label: "9.",
    lines: ["The enzyme is salivary amylase or ptyalin."],
  },
];

function renderAnswerSheet() {
  const pageCount = Math.max(...ANSWER_BLOCKS.map((block) => block.page));
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const { canvas, ctx } = ruledPage();
    const blocks = ANSWER_BLOCKS.filter((block) => block.page === pageNumber);

    let y = blocks[0]?.startsAtTop ? 150 : 190;
    ctx.fillStyle = "#1b2a6b";

    for (const block of blocks) {
      if (block.label) {
        ctx.font = "34px HandWriting";
        ctx.fillText(block.label, 80, y);
      }
      ctx.font = "30px HandWriting";
      for (const line of block.lines) {
        ctx.fillText(line, 165, y);
        y += 46;
      }
      // A generous gap is the visual signal that one answer has ended.
      y += block.runsToBottom ? 0 : 74;
    }

    pages.push(canvas);
  }

  return pages;
}

/* ---------------------------------- io ----------------------------------- */

async function toPdf(canvases, file) {
  const pdf = await PDFDocument.create();
  for (const canvas of canvases) {
    const png = await pdf.embedPng(canvas.toBuffer("image/png"));
    const page = pdf.addPage([png.width, png.height]);
    page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  }
  await fs.writeFile(file, await pdf.save());
}

await fs.mkdir(OUT, { recursive: true });

const paperPages = renderQuestionPaper();
const sheetPages = renderAnswerSheet();

await toPdf(paperPages, path.join(OUT, "question-paper.pdf"));
await toPdf(sheetPages, path.join(OUT, "answer-sheet.pdf"));
await fs.writeFile(
  path.join(OUT, "answer-sheet-page1.png"),
  sheetPages[0].toBuffer("image/png"),
);
await fs.writeFile(
  path.join(OUT, "question-paper-page1.png"),
  paperPages[0].toBuffer("image/png"),
);

console.log(
  `question paper: ${paperPages.length} pages\nanswer sheet:   ${sheetPages.length} pages`,
);
