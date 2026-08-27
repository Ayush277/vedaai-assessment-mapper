<div align="center">

<img src="public/avatar/logo-banner.svg" alt="VedaAI" width="380" />

### AI Assessment Extraction &amp; Answer Mapping

Upload a question paper and a student's handwritten answer sheet.
Get every question in printed order, every answer mapped to its question,
and the exact region of the page highlighted when you click.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-vision%20%2B%20embeddings-4285F4?style=flat-square&logo=google&logoColor=white)
![Tests](https://img.shields.io/badge/tests-137%20passing-16A34A?style=flat-square)

</div>

---

## Contents

1. [What it does](#1-what-it-does)
2. [Screens](#2-screens)
3. [**Run it on your own PC**](#3-run-it-on-your-own-pc)
4. [How it works](#4-how-it-works)
5. [AI model and API](#5-ai-model-and-api)
6. [Accuracy](#6-accuracy)
7. [Edge cases](#7-edge-cases)
8. [Implementation quality](#8-implementation-quality)
9. [Tech stack and structure](#9-tech-stack-and-structure)
10. [Deployment](#10-deployment)
11. [Assumptions and limitations](#11-assumptions-and-limitations)

---

## 1. What it does

### The problem

Marking a paper by hand means holding two documents in your head at once. The
question paper is ordered; the answer sheet almost never is. A student answers 3
before 2, skips 4 entirely, runs question 7 across a page break, and labels an
answer `18` on a paper that stops at `12`.

This app does that reconciliation, and shows its work.

### The features

| Capability | Behaviour |
|---|---|
| **Whole class at once** | Upload one question paper and a sheet per student; each is evaluated against the same paper |
| **Student switching** | Next/Previous or jump by name — sheet, marks, report and insights all follow |
| **Evaluation report** | Beside the answer sheet, not on a separate page: score, band, tallies, strengths, areas to improve |
| **Teacher review** | Edit any mark or feedback; the score, band and tallies move with it, and Revert restores the AI's original |
| **Publish** | Publishes the teacher's final view, not the AI's first draft |
| **Question extraction** | Every question in printed order, original numbering preserved |
| **Sub-parts** | `11 (a)` and `11 (b)` are separate entries, indented under `11` |
| **Handwriting extraction** | Read page by page, segmented into discrete answers |
| **Answer mapping** | Correct even when answers are written out of order |
| **Unanswered** | Flagged plainly — no answer is invented or borrowed |
| **Unmatched** | Surfaced in their own panel instead of being dropped |
| **Multi-page answers** | Followed across page breaks, every region highlighted |
| **Exact highlighting** | The region, never the whole page |
| **Grading** | Marks, percentage and feedback per question and overall |
| **Expected answers** | For blank questions, what the answer should have been |

---

## 2. Screens

<table>
<tr>
<td width="50%" valign="top">

**Upload**

<img src="docs/screenshots/01-upload.png" alt="Upload screen" />

Two drop zones, format and size validation, action disabled until both files are
present.

</td>
<td width="50%" valign="top">

**Results**

<img src="docs/screenshots/02-results.png" alt="Results screen" />

Questions left in printed order, answer sheet right as one continuous scroll.

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Click a question → the answer highlights**

<img src="docs/screenshots/03-highlight.png" alt="Answer highlighted" />

The sheet scrolls to it and outlines it green. Faint dashed outlines mark every
other answer — click one to jump back the other way.

</td>
<td width="50%" valign="top">

**An answer spanning two pages**

<img src="docs/screenshots/04-multipage.png" alt="Multi-page answer" />

Question 7 runs from page 2 onto page 3. Both regions highlight; the card is
chipped `Pages 2, 3`.

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Unanswered, with the expected answer**

<img src="docs/screenshots/05-unanswered.png" alt="Unanswered question" />

Captioned *Written by AI · not the student's work*, so it can never be read as
extracted handwriting.

</td>
<td width="50%" valign="top">

**Unmatched answers**

<img src="docs/screenshots/06-unmatched.png" alt="Unmatched answers" />

An answer labelled `18` on a paper stopping at `12` gets its own panel and its own
highlight.

</td>
</tr>
</table>

<div align="center">
<img src="docs/screenshots/07-mobile.png" alt="Mobile layout" width="300" />
<br/>
<sub>Below the desktop breakpoint the two panels become tabs.</sub>
</div>

---

## 3. Run it on your own PC

### Prerequisites

| | |
|---|---|
| **Node.js** | 20.9 or newer — check with `node -v` ([download](https://nodejs.org)) |
| **npm** | Ships with Node — check with `npm -v` |
| **An API key** | Optional. Without one the app runs on offline OCR |

Works on macOS, Linux and Windows. No database, no Docker, no native build tools —
PDF rendering is WebAssembly.

### Step 1 — Get the code

```bash
git clone https://github.com/Ayush277/vedaai-assessment-mapper.git
cd vedaai-assessment-mapper
```

### Step 2 — Install

```bash
npm install
```

### Step 3 — Configure

```bash
cp .env.example .env.local
```

Open `.env.local` and set your key:

```ini
AI_PROVIDER=gemini
AI_API_KEY=your-key-here
```

> **No key?** Leave `AI_API_KEY` blank and the app runs on **Tesseract OCR**
> locally — no key, no quota, no network. Printed question papers read well;
> handwriting recognition is weaker, and the interface says so.

<details>
<summary><b>Where to get a free key</b></summary>

<br/>

**Google Gemini** (recommended — vision *and* embeddings on one key)
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. **Create API key**
3. Paste it into `AI_API_KEY`

**Anthropic Claude** (alternative)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create a key, add a few dollars of credit
3. Set `AI_PROVIDER=anthropic` and `AI_MODEL=claude-sonnet-5`

</details>

### Step 4 — Run

```bash
npm run dev
```

Open **<http://localhost:3000>**

### Step 5 — Try it

You need a question paper and an answer sheet. Two ways:

**A. Generate sample papers**

```bash
npm run fixtures
```

Writes `fixtures/question-paper.pdf` and `fixtures/answer-sheet.pdf`. The answer
sheet deliberately contains every hard case: answers out of order, a question
skipped, an answer running from page 2 onto page 3, and an answer labelled `18`
when the paper stops at `12`.

**B. Skip uploading entirely**

Visit **<http://localhost:3000/demo>** — a saved run of the real pipeline. Costs
nothing, needs no key, always works.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | 158 unit tests |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint |
| `npm run fixtures` | Generate the sample question paper and answer sheet |

### Environment variables

All optional. With nothing set, the app runs on offline OCR.

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini`, `anthropic`, or `local` |
| `AI_API_KEY` | *(empty)* | **Empty ⇒ falls back to `local`** |
| `AI_MODEL` | per provider | Override the model |
| `AI_EMBEDDING_MODEL` | `gemini-embedding-001` | Gemini only |
| `ENABLE_GRADING` | `true` | `false` skips grading |
| `MAX_UPLOAD_MB` | `10` | Per-file upload limit |
| `MAX_PAGES_PER_DOCUMENT` | `12` | Caps runaway API cost |
| `PROVIDER_MIN_INTERVAL_MS` | `3200` | Floor between provider calls. `0` on a paid tier |

The key is read server-side only and never reaches the browser.

### Troubleshooting

<details>
<summary><b>Port 3000 already in use</b></summary>

<br/>

The scripts honour `PORT`:

```bash
PORT=3001 npm run dev
```

</details>

<details>
<summary><b>"The AI service is rate limited"</b></summary>

<br/>

Gemini's free tier allows **20 requests/day per model**, and a five-page run costs
roughly 8 — about two runs a day. Either wait for the daily reset, enable billing,
or set `AI_PROVIDER=local` to work offline.

The run falls back to local OCR automatically rather than failing outright.

</details>

<details>
<summary><b>"No AI provider is configured" banner</b></summary>

<br/>

Expected when `AI_API_KEY` is blank — the app is on offline OCR. Add a key and
restart to remove it.

</details>

<details>
<summary><b>Slow first run on offline OCR</b></summary>

<br/>

Tesseract downloads its language data (~5 MB) on first use. Subsequent runs are
fast.

</details>

---

## 4. How it works

```
upload (PDF / PNG / JPG)
   ↓  lib/document      normalise → page images        (PDFium WASM + sharp)
   ↓  lib/vision        segment    → ink regions with real pixel coordinates
   ↓  lib/ai            transcribe → text for each region crop
   ↓  lib/extraction    structure  → Question[] and Answer[]
   ↓  lib/mapping       match      → AnswerMapping[] with confidence
   ↓  lib/ai/grading    evaluate   → marks, feedback, expected answers
   ↓  AssessmentResult  → results viewer
```

### One paper, many students

Questions are extracted once and shared; each student's sheet is read, mapped and
graded against that same list. A student is a `StudentResult` — sheet, answers,
mappings, grades — and the question list lives on the assessment above them, so
two students' copies cannot drift apart.

One unreadable scan does not discard the batch: that student is kept with the
reason attached, the rest process normally, and the switcher marks them.

### Teacher review, and what "published" means

An edit is stored *beside* the AI's grade, never over it. That is what lets the
report say how much of a score is the teacher's, lets **Revert to AI** work
without re-running anything, and lets the published set be the teacher's final
view rather than the model's first draft.

The score, band and tallies are recomputed from whichever grades are in force, so
correcting one question moves the header with it — the report can never disagree
with the questions below it. Publishing records what it covered; editing anything
afterwards clears it, so the panel cannot claim to have published something since
changed.

### The idea that makes highlighting accurate

Language models are unreliable at reporting pixel coordinates. So the pipeline
**never asks one for a bounding box.**

`lib/vision/segmentation.ts` finds *where* content sits using classic computer
vision — Bradley–Roth adaptive thresholding, ruled-line suppression, a horizontal
projection profile to find text lines, then gap-based grouping into blocks. Each
block is cropped, and only those crops go to the vision model to be read.

Text and coordinates therefore describe the same pixels **by construction**, not
by the model's spatial guesswork. A telling side effect: the coordinates come out
byte-identical whether the run used Gemini, Claude or offline Tesseract, because
the reader never touches them.

### Mapping — deterministic first, AI last

Five signals, ordered by how much they can be trusted. A later step may only fill
a gap an earlier one left; a model never overturns a label the student wrote.

| # | Signal | Confidence |
|---|---|---|
| 1 | **Explicit label** — student wrote `11(b)`, paper has `11(b)` | `0.97` |
| 2 | **Fuzzy label** — same-length digit substitution (`13` misread as `18`) | `0.72` |
| 3 | **Structural order** — unlabelled answer between two confident anchors | `0.68` |
| 4 | **Semantic similarity** — embeddings, else local TF-IDF | ≤ `0.70` |
| 5 | **LLM reasoning** — only for what is still ambiguous | ≤ `0.78` |

An answer whose written label matches *no* question is withheld from steps 4 and 5
entirely and reported as unmatched. A student answering `18` on a paper numbered
1–12 must not be quietly attached to question 8.

---

## 5. AI model and API

**Google Gemini** — `gemini-flash-latest` for vision, `gemini-embedding-001` for
semantic similarity.

Chosen because it is the only widely available free tier offering vision *and*
embeddings under one key, it handles handwriting well, and it accepts many images
per request — which matters because the pipeline sends one request per page
containing every region crop from that page.

Three providers behind one interface (`lib/ai/provider.ts`):

| `AI_PROVIDER` | Vision | Embeddings | Notes |
|---|---|---|---|
| `gemini` *(default)* | ✅ | ✅ | Recommended |
| `anthropic` | ✅ | ➖ falls back to TF-IDF | Set `AI_MODEL=claude-sonnet-5` |
| `local` | Tesseract.js | ➖ | **No key needed.** Automatic when `AI_API_KEY` is unset |

`local` is a genuine fallback, not a stub: files flow through the whole pipeline
and coordinates are still real. Those runs are marked degraded and the UI says so
rather than presenting shaky output confidently.

**If the cloud provider gives out mid-run** — quota exhausted, key rejected — the
pipeline falls back to local OCR and finishes rather than ending on an error page.

Adding a provider means one file in `lib/ai/providers/`. No other module imports a
vendor SDK.

---

## 6. Accuracy

Measured on the bundled fixture paper — 14 questions, 4-page answer sheet — with
Gemini. Reproduce with `npm run fixtures`.

### Question extraction — 14 / 14

```
1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 11 (a) · 11 (b) · 12
```

Labels preserved verbatim (`11 (a)`, not normalised to `11a`), marks and sections
captured, page furniture ignored. Order comes from page number and vertical
position — never from model output — so the AI cannot reorder the paper.

Two questions sharing one OCR line are split apart; `= 22/7 x 7 x 7` is not.

### Answer mapping — 9 / 9, zero false matches

All matched by explicit label at `0.97`.

- Student wrote answers in the order **1, 3, 2** — all landed on the right
  questions, and the display order still followed the paper.
- Questions **4, 6, 8, 10** and the stem **11** correctly reported unanswered.
- The answer labelled **18** correctly reported unmatched.

### Highlighting — 13 regions, mean 5.8% of a page

Largest region 34.9%. Never the whole page. Coordinates are normalized 0–1 and
rendered as CSS percentages, so a highlight stays pinned through window resizes
and zoom — verified holding position at **200% zoom**.

### Why accuracy is shown as two numbers

"Accuracy" hides two different questions: how well the handwriting was *read*, and
how sure we are it belongs to *this* question. A crisp answer matched by a guess
and a smudged answer matched by an explicit label are both uncertain, for opposite
reasons.

A real example from an offline-OCR run: **handwriting read 89%, match confidence
72%** — the writing was legible, but OCR turned `11 (a)` into `10`, so the match is
what needs checking, not the transcription. Every expanded question shows both.

---

## 7. Edge cases

Each generated as a fixture and run through the real pipeline.

| Case | Behaviour |
|---|---|
| Answers written out of order | Mapped correctly; display order follows the paper |
| Question skipped entirely | `Unanswered`; no answer invented or borrowed |
| Answer labelled for a question that does not exist | Own `Unmatched` panel, clickable to its region |
| Answer spanning a page break | One answer, both regions highlighted, chipped `Pages 2, 3` |
| Sub-parts `11 (a)` / `11 (b)` | Separate entries, indented, chipped `Part of 11` |
| Closing bracket lost by OCR (`11 (b`) | Still resolves to `11b` instead of collapsing onto the parent |
| Crossed-out answer | Ignored, and counted in the processing notes |
| **1 question** — 432-char question, 2035-char answer over 2 pages | No overflow; the long answer scrolls inside its card |
| **40 questions**, 39 unanswered | All render; panel scrolls 5308px with the filter bar pinned |
| Blank page in the answer sheet | Reported as a processing note |
| Repeated selection of the same question | Re-centres the sheet on it |
| Rapid switching between questions | Lands on the last clicked; exactly one selected |
| Extraction failure / empty / corrupt PDF | Named error with a retry, never a stack trace |
| Provider quota exhausted mid-run | Falls back to offline OCR and finishes, marked degraded |
| Server dies mid-job | Client detects the stall and offers a retry rather than spinning |

---

## 8. Implementation quality

**137 tests** over the logic that decides correctness — label parsing, question
extraction, answer segmentation, mapping, coordinate rendering, computer vision,
provider parsing, error classification and degradation reporting.

Five things worth knowing before reading the code:

- **No `any`.** Strict TypeScript throughout; the domain model lives in one file
  (`lib/types/assessment.ts`).
- **Coordinates have exactly one representation.** Everything leaving `lib/vision`
  is a `NormalizedBoundingBox` in 0–1 page space. Conversion happens at the
  provider boundary and nowhere else.
- **Scrolling is imperative, not effect-driven.** Re-selecting the already-selected
  question yields an identical target, so an effect keyed on it would not re-run
  and the sheet would sit still.
- **Scroll offsets come from `getBoundingClientRect`, not `offsetTop`.** The results
  panel animates in on mount, and that transform changes what `offsetParent`
  resolves to.
- **Errors are classified once.** Timeouts, dropped connections, rate limits and
  rejected keys all become typed `ProviderError`s, so retry policy and user-facing
  copy are decided in one place. No provider body or stack trace reaches the browser.

### Cost control

Deterministic work happens before any paid call: PDF rasterisation, ink
segmentation, label parsing and label matching are all local. The AI structuring
pass is **skipped entirely** when the printed numbering already came out clean.
Region crops are batched twelve to a request, requests are serialised and paced,
unanswered questions score zero without an LLM call, and grading is one batched
request for the whole paper.

### Product decisions

- **Progress is real** — nine stages driven by the backend's actual position, not a
  timer. A retrying request says *"retrying 4/5 — provider overloaded, waiting 48s"*
  rather than appearing frozen.
- **Nothing looks clickable and does nothing** — navigation from the design that is
  outside this build is drawn but disabled, lock-marked, and explains itself.
- **Uncertainty is visible** — confidence bands, a *needs review* state, and a
  "How this was matched" note listing the signals used.
- **Degraded runs say so** — an exhausted quota, a rejected key and an unconfigured
  provider produce three different explanations, not three identical blanks.
- **Keyboard navigable** — ↑/↓ move through questions, `Esc` clears the selection.

---

## 9. Tech stack and structure

| Layer | Choice |
|---|---|
| **Framework** | Next.js 15 (App Router), React 19, TypeScript (strict) |
| **Styling** | Tailwind CSS v4, design tokens taken from the Figma |
| **PDF** | PDFium compiled to WebAssembly — no native deps to deploy |
| **Images** | sharp |
| **Vision / LLM** | Google Gemini · Anthropic Claude · Tesseract.js |
| **Computer vision** | Hand-written: adaptive threshold, projection profiles, block grouping |
| **Tests** | Vitest |
| **State** | None on the server — the run streams down one request. No database, no authentication |

```
src/
  app/
    page.tsx                     upload → processing → results, one streamed run
    demo/                        saved sample run
    api/process/                 POST → streams progress, then the result
  components/
    shell/  upload/  processing/  results/  answer-viewer/  ui/
  lib/
    ai/          provider contracts, gemini | anthropic | local, grading, model answers
    document/    pdf (PDFium WASM), images (sharp), normalise + validate
    vision/      segmentation — the CV that produces every coordinate — transcribe
    extraction/  questions, answers
    mapping/     normalize-label, deterministic, semantic, mapper
    processing/  pipeline, stages
    types/       assessment.ts — the whole domain model
  test/          158 tests
scripts/
  make-fixtures.mjs              generates the test question paper + answer sheet
  make-edge-fixtures.mjs         one-question and 40-question papers
```

---

## 10. Deployment

Standard Next.js 15 — no database, no authentication. Everything heavy is WASM or
pure JS, so there are no native system libraries to install.

### Vercel

1. Import the repository.
2. Add `AI_PROVIDER` and `AI_API_KEY` under **Settings → Environment Variables**.
3. Deploy.

`POST /api/process` declares `maxDuration = 300`. The whole run happens inside
that one request, so a very long document can outrun the platform's ceiling — the
client says so plainly and suggests fewer pages rather than hanging.

### Any Node host — Render, Railway, Fly, a VM

```bash
npm ci && npm run build && npm start
```

A long-running Node process is the better fit: no execution ceiling, and jobs stay
on one instance.

### Why the run streams instead of polling

A run holds no server-side state at all. `POST /api/process` does the whole
pipeline inside one request and streams newline-delimited JSON back: a run of
`stage` frames carrying live progress, then exactly one `result` or `error`
frame. Rendered pages travel inside the result as data URLs.

The first design returned a job id and let the client poll, with state written to
`os.tmpdir()`. That works on a single machine and fails on a serverless host for
a reason worth remembering: the upload lands on one instance and every poll lands
on another, so the job the client was just told about does not exist anywhere it
can look — the run succeeds and the page reports "no longer available".

Keeping the run inside one request removes the need to share anything between
instances, needs no database or object store, and gives finer-grained progress
than polling did. The trade-off is that a result lives in the browser tab: there
is no URL to bookmark, and reloading starts over.

---

## 11. Assumptions and limitations

Real ones. The app is built to show them rather than hide them.

- **Handwriting quality is the ceiling.** Faint pencil, heavy slant, cramped spacing
  or a low-resolution scan all degrade transcription. Low-confidence answers are
  flagged, not silently trusted.
- **Answers with no label and no distinctive content may stay unmatched.** Deliberate:
  the app leaves a question unanswered rather than guessing.
- **Complex layouts** — multi-column papers, dense tables, questions boxed inside
  graphics — can confuse the projection-profile segmenter, which assumes roughly
  horizontal lines of text.
- **Diagrams are described, not understood.** A drawn answer is transcribed as
  `[diagram of …]` and highlighted correctly, but grading it is unreliable.
- **Rotated or badly skewed scans are not deskewed.** Pages are EXIF-rotated only.
- **Free-tier quotas are small.** Gemini allows 20 requests/day per model; a
  five-page run costs roughly 8 — about two runs a day. Enable billing or use a
  second project for anything beyond light testing.
- **Grading is secondary by design.** One batched call, degrades to "unavailable"
  without failing the run, and anything the mapper flagged for review is flagged in
  the grade too.
- **One student per answer sheet**, and questions must be numbered. An unnumbered
  paper produces a clear error rather than a guess.

---

<div align="center">
<sub>Built by <a href="https://github.com/Ayush277">Ayush Kumar</a> · VedaAI hiring assignment</sub>
</div>
