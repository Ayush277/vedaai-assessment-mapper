/**
 * Edge-case fixtures for the UI QA pass.
 *
 * These exercise the shapes the interface has to survive rather than the
 * accuracy of extraction: a single question, a very long question and answer,
 * and a paper with far more questions than fit on screen.
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
const H = 1754;
const OUT = path.resolve("fixtures/edge");

function page(bg = "#ffffff") {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx };
}

function ruled() {
  const { canvas, ctx } = page("#fdfdf7");
  ctx.strokeStyle = "#cfd8e8";
  ctx.lineWidth = 1.5;
  for (let y = 120; y < H - 60; y += 46) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(W - 70, y);
    ctx.stroke();
  }
  return { canvas, ctx };
}

function wrap(text, max) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      lines.push(line.trim());
      line = word;
    } else line += ` ${word}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function toPdf(canvases, file) {
  const pdf = await PDFDocument.create();
  for (const canvas of canvases) {
    const png = await pdf.embedPng(canvas.toBuffer("image/png"));
    const p = pdf.addPage([png.width, png.height]);
    p.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  }
  await fs.writeFile(file, await pdf.save());
}

/* ------------------------- single, very long question -------------------- */

const LONG_Q =
  "Explain in full detail the complete process of aerobic cellular respiration in eukaryotic cells, naming every stage in order, stating precisely where in the cell each stage occurs, listing the inputs and the outputs of each stage, explaining the role of the electron transport chain and chemiosmosis, and finally comparing the total ATP yield of aerobic respiration with that of anaerobic respiration in both animal and yeast cells. [20]";

const LONG_A =
  "Aerobic respiration is the process by which cells release energy from glucose using oxygen. It happens in four main stages. The first stage is glycolysis which takes place in the cytoplasm of the cell and does not need oxygen. In glycolysis one molecule of glucose which has six carbons is split into two molecules of pyruvate which have three carbons each. This produces a net gain of two ATP and also two molecules of reduced NAD. The second stage is the link reaction which happens in the mitochondrial matrix. Here each pyruvate is decarboxylated and dehydrogenated to form acetyl coenzyme A releasing carbon dioxide and producing more reduced NAD. The third stage is the Krebs cycle which also happens in the matrix. Acetyl coenzyme A joins with a four carbon compound to make a six carbon compound and through a series of reactions carbon dioxide is released and reduced NAD and reduced FAD are produced along with one ATP per turn. The fourth stage is oxidative phosphorylation which happens on the inner mitochondrial membrane. The reduced NAD and reduced FAD are oxidised and the electrons they release pass along the electron transport chain. As the electrons move down the chain energy is released and used to pump protons into the intermembrane space creating a proton gradient. The protons then flow back through ATP synthase and this movement drives the synthesis of ATP which is called chemiosmosis. Oxygen acts as the final electron acceptor and joins with protons and electrons to form water. In total aerobic respiration yields about thirty eight ATP per glucose molecule although in practice it is closer to thirty because some energy is used moving substances into the mitochondria. Anaerobic respiration produces far less energy because the Krebs cycle and the electron transport chain cannot run without oxygen. In animal cells pyruvate is converted to lactate and only the two ATP from glycolysis are gained. In yeast cells pyruvate is converted into ethanol and carbon dioxide and again only two ATP are gained.";

async function buildLong() {
  const { ctx: qctx, canvas: qcanvas } = page();
  qctx.fillStyle = "#111";
  qctx.font = "bold 30px Helvetica";
  qctx.textAlign = "center";
  qctx.fillText("Biology — Single Question Paper", W / 2, 80);
  qctx.textAlign = "left";
  qctx.font = "22px Helvetica";
  let y = 160;
  qctx.fillText("1.", 80, y);
  for (const line of wrap(LONG_Q, 58)) {
    qctx.fillText(line, 130, y);
    y += 34;
  }

  const sheets = [];
  let sheet = ruled();
  let sy = 190;
  sheet.ctx.fillStyle = "#1b2a6b";
  sheet.ctx.font = "34px HandWriting";
  sheet.ctx.fillText("1.", 80, sy);
  sheet.ctx.font = "30px HandWriting";
  for (const line of wrap(LONG_A, 44)) {
    if (sy > H - 90) {
      sheets.push(sheet.canvas);
      sheet = ruled();
      sheet.ctx.fillStyle = "#1b2a6b";
      sheet.ctx.font = "30px HandWriting";
      sy = 150;
    }
    sheet.ctx.fillText(line, 165, sy);
    sy += 46;
  }
  sheets.push(sheet.canvas);

  await toPdf([qcanvas], path.join(OUT, "one-question-paper.pdf"));
  await toPdf(sheets, path.join(OUT, "one-question-answers.pdf"));
  return { qPages: 1, aPages: sheets.length };
}

/* ------------------------------ many questions --------------------------- */

async function buildMany(count = 40) {
  const pages = [];
  let { canvas, ctx } = page();
  let y = 100;
  ctx.fillStyle = "#111";
  ctx.font = "bold 28px Helvetica";
  ctx.fillText("General Science — Long Paper", 80, 60);
  ctx.font = "21px Helvetica";

  for (let i = 1; i <= count; i += 1) {
    if (y > H - 90) {
      pages.push(canvas);
      ({ canvas, ctx } = page());
      ctx.fillStyle = "#111";
      ctx.font = "21px Helvetica";
      y = 90;
    }
    ctx.fillText(`${i}. Short factual question number ${i} about the topic. [2]`, 80, y);
    y += 40;
  }
  pages.push(canvas);

  // Only a handful are answered, so unanswered dominates the list.
  const sheet = ruled();
  sheet.ctx.fillStyle = "#1b2a6b";
  let sy = 190;
  for (const n of [1, 5, 9]) {
    sheet.ctx.font = "34px HandWriting";
    sheet.ctx.fillText(`${n}.`, 80, sy);
    sheet.ctx.font = "30px HandWriting";
    sheet.ctx.fillText(`This is the written answer for question ${n}.`, 165, sy);
    sy += 130;
  }

  await toPdf(pages, path.join(OUT, "many-questions-paper.pdf"));
  await toPdf([sheet.canvas], path.join(OUT, "many-questions-answers.pdf"));
  return { qPages: pages.length, count };
}

await fs.mkdir(OUT, { recursive: true });
console.log("long:", await buildLong());
console.log("many:", await buildMany());
