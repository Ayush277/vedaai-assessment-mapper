# VedaAI — Assessment Extraction & Answer Mapping

A teacher-facing web app. Upload a question paper and one student's handwritten
answer sheet; the app extracts every question in printed order, reads the
handwriting, works out which answer belongs to which question, and — when you
click a question — jumps to the right page and highlights the exact region where
that answer was written.

Uploaded files really do drive the results. Nothing about the questions,
answers, mappings or highlight coordinates is hardcoded.

---

## What it does

| Requirement | How it is handled |
|---|---|
| Multi-page PDF / PNG / JPG for both documents | PDFium (WASM) rasterises PDFs page by page; images become a single page |
| Every question, in printed order | Order comes from page number + vertical position, never from model output |
| Labelled sub-parts as separate questions | `11(a)` and `11(b)` are distinct entries with `parentId` linking them to `11` |
| Original labels preserved | `Q1.`, `11 (a)`, `5(ii)` are kept verbatim; a canonical form is used only for matching |
| Answers written out of order | Matching is by label/content, display order always follows the paper |
| Unanswered questions | Shown explicitly; no answer is invented or borrowed from a neighbour |
| Unmatched answers | Surfaced in their own panel with a clickable region on the sheet |
| Answers spanning pages | One answer, many regions; the viewer flags and links the continuation |
| Exact highlighting | Normalized 0–1 boxes from real ink detection, rendered as CSS percentages |
| Confidence | Every mapping carries a score, a band, and the reasons behind it |
| Degraded runs | When an optional AI step cannot run, the results screen names the cause — expired key, exhausted quota, wrong model, network — instead of silently omitting it |
| Two-way sync | Clicking a question scrolls the sheet to its answer; clicking a region on the sheet opens that question |
| Grading summary | Score, percentage and correct/partial/incorrect/unanswered/needs-review tallies, all computed from the run |
| Expected answers | For questions the student left blank, the AI writes what the answer should have been, with the marking points — labelled as the model answer, never as the student's work |
| Accuracy per question | Two separate readings — how clearly the handwriting was read, and how sure the mapping is — because they fail for opposite reasons |
| Sub-part hierarchy | `11 (a)` and `11 (b)` are separate entries, indented under `11` and chipped "Part of 11" |
| Progress | Stage-based, driven by the backend's real position in the pipeline |

---

## Architecture

```
upload (PDF/PNG/JPG)
   ↓  lib/document      normalise → page images (PDFium WASM + sharp)
   ↓  lib/vision        segment    → ink regions with real pixel coordinates
   ↓  lib/ai            transcribe → text for each region crop
   ↓  lib/extraction    structure  → Question[] and Answer[]
   ↓  lib/mapping       match      → AnswerMapping[] with confidence
   ↓  lib/ai/grading    evaluate   → optional marks and feedback
   ↓  AssessmentResult  → results viewer
```

### The one idea that makes highlighting accurate

Language models are unreliable at reporting pixel coordinates. So the pipeline
**never asks one for a bounding box**.

Instead, `lib/vision/segmentation.ts` finds where content sits using classic
computer vision — adaptive (Bradley–Roth) thresholding, ruled-line suppression,
a horizontal projection profile to find text lines, then gap-based grouping into
blocks. Each block is cropped, and only those crops are sent to the vision model
to be read.

Text and coordinates therefore describe the same pixels *by construction*. A
side effect worth noting: the coordinates are identical whether you run with
Gemini, Claude, or the offline Tesseract fallback, because the reader never
touches them.

### Mapping: deterministic first, AI last

`lib/mapping/mapper.ts` runs five signals in order of how much they can be
trusted. A later step may only fill a gap an earlier one left — a model never
overturns a label the student actually wrote.

1. **Explicit label** — the student wrote `11(b)` and the paper has `11(b)`. `0.97`
2. **Fuzzy label** — a same-length digit substitution (`13` misread as `18`).
   Sub-parts must match exactly, and only an unambiguous single candidate is
   accepted. `0.72`
3. **Structural order** — an unlabelled answer sitting between two confident
   anchors, where exactly one question remains in that range. `0.68`
4. **Semantic similarity** — embeddings when available, otherwise a local TF-IDF
   cosine. Capped at `0.70` and always flagged for review.
5. **LLM reasoning** — only for what is genuinely still ambiguous. Capped at `0.78`.

An answer whose written label matches *no* question on the paper is withheld
from steps 4 and 5 entirely and reported as unmatched. A student answering "18"
on a paper numbered 1–14 must not be quietly attached to question 8.

---

## AI model / API

**Default provider: Google Gemini** (`gemini-flash-latest`), with
`gemini-embedding-001` for semantic similarity.

Why: it is the only widely available free tier that offers vision *and*
embeddings under one key, it handles handwriting well, and it accepts many
images in a single request — which matters because the pipeline sends one
request per page containing every region crop from that page.

Three providers ship behind one interface (`lib/ai/provider.ts`):

| `AI_PROVIDER` | Vision | Embeddings | Notes |
|---|---|---|---|
| `gemini` *(default)* | ✅ | ✅ | Recommended |
| `anthropic` | ✅ | ➖ falls back to TF-IDF | Set `AI_MODEL=claude-sonnet-5` |
| `local` | Tesseract.js | ➖ | **No API key needed.** Used automatically when `AI_API_KEY` is unset |

`local` mode is a genuine fallback, not a stub: files still flow through the
whole pipeline and coordinates are still real. It reads printed question papers
well and handwriting poorly, so runs are marked `degraded` and the UI says so
rather than presenting shaky output confidently.

Adding a provider means one file in `lib/ai/providers/` — no other module
imports a vendor SDK.

### Accuracy, and why it is two numbers

"Accuracy" hides two different questions: how well the handwriting was *read*,
and how sure we are it belongs to *this* question. A crisp answer matched by a
guess and a smudged answer matched by an explicit label are both uncertain, for
opposite reasons, and a teacher checking the paper needs to know which. Each
expanded question shows both, plus marks awarded when grading ran.

A real example from a local-OCR run: handwriting read **89%**, match confidence
**72%** — the writing was legible, but OCR turned "11 (a)" into "10", so the
match is the part that needs checking, not the transcription.

### Cost control

Deterministic work happens before any paid call: PDF rasterisation, ink
segmentation, label parsing and label matching are all local. The AI structuring
pass is skipped entirely when the printed numbering already came out clean — a
contiguous run from 1 with real text needs no second opinion, and the free tier
meters requests per day. Region crops are
batched twelve to a request, requests are serialised and paced
(`PROVIDER_MIN_INTERVAL_MS`), unanswered questions are scored zero without an
LLM call, and grading is a single batched request for the whole paper.

---

## Local setup

```bash
npm install
cp .env.example .env.local   # add your key, or leave AI_API_KEY blank for local OCR
npm run dev
```

Open http://localhost:3000.

```bash
npm run build      # production build
npm test           # 137 unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

### Try it without your own papers

```bash
npm run fixtures   # writes fixtures/question-paper.pdf and fixtures/answer-sheet.pdf
```

The generated answer sheet deliberately contains the hard cases: answers written
out of order, a question skipped entirely, an answer that runs off page 2 onto
page 3, and an answer labelled `18` when the paper stops at `12`.

Or visit **`/demo`** for a saved run — see [Sample / demo mode](#sample--demo-mode).

---

## Environment variables

Copy `.env.example` to `.env.local`. All of it is optional; with nothing set the
app runs on local OCR.

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini`, `anthropic`, or `local` |
| `AI_API_KEY` | *(empty)* | Key for the provider. **Empty ⇒ falls back to `local`** |
| `AI_MODEL` | per provider | Override the model |
| `AI_EMBEDDING_MODEL` | `gemini-embedding-001` | Gemini only |
| `ENABLE_GRADING` | `true` | Set `false` to skip the grading call |
| `MAX_UPLOAD_MB` | `10` | Per-file upload limit |
| `MAX_PAGES_PER_DOCUMENT` | `12` | Caps runaway API cost on long documents |
| `PROVIDER_MIN_INTERVAL_MS` | `3200` | Floor between provider calls. Set `0` on a paid tier |

The key is read server-side only and is never sent to the browser. Provider
error messages are sanitised before they reach the client; the raw cause is
logged server-side.

---

## Deployment

The app is a standard Next.js 15 App Router project with no database and no
authentication. Everything heavy is WASM or a pure-JS library, so there are no
native system libraries to install.

### Vercel

1. Push to GitHub and import the repository.
2. Add `AI_PROVIDER` and `AI_API_KEY` under **Settings → Environment Variables**.
3. Deploy.

`POST /api/process` declares `maxDuration = 300` and continues the pipeline in
`after()`, which keeps the function alive past the response. On the Hobby plan
the ceiling is lower, so keep documents short or use `MAX_PAGES_PER_DOCUMENT`.

### Any Node host (Render, Railway, Fly, a VM)

```bash
npm ci && npm run build && npm start
```

A long-running Node process is the better fit: there is no execution ceiling,
and jobs stay on one instance.

### Job storage

Jobs and rendered pages live under `os.tmpdir()/vedaai-jobs/<jobId>/`, written
atomically and swept after one hour. This needs no database, works on serverless
and on a VM, and survives the module reloads that would silently drop an
in-memory map. The trade-off is that it is instance-local: on a
multi-instance deployment, put a sticky session in front, or swap
`lib/processing/job-store.ts` for object storage — it is the only module that
touches persistence.

---

## Sample / demo mode

`/demo` renders a saved run of the real pipeline over the bundled fixtures. It
loads a static JSON file and static page images — no API key, no credits, no job
store. It is clearly banner-marked as sample data, and the upload flow never
touches it.

To refresh it after a pipeline change, run a real job and capture it:

```bash
npm run capture:demo -- <jobId>
```

The capture re-runs the *current* mapping code over the stored questions and
answers, so the sample can never drift from how the mapper behaves today. Only
the vision stage is frozen.

The bundled sample shows 14 extracted questions, out-of-order answers, an answer
spanning pages 2–3, five unanswered questions, and one unmatched answer. Grading
is absent from this particular capture because the grading call was unavailable
during that run — which is itself a real state the app handles.

---

## Testing

```bash
npm test
```

137 tests over the logic that decides correctness, not the pixels:

- **Label normalisation** — `11(a)`, `11 (a)`, `Q11(a)`, `Question 11(a)`, `11-a`
  all collapse to one form; `11` stays distinct from `11a`; OCR digit confusions
  are repaired; a closing bracket lost by OCR (`11 (b`) still resolves to `11b`
  rather than collapsing onto the parent; `2` sorts before `10`.
- **Question parsing** — `10, 11, 11(a), 11(b), 12` come out as five questions in
  printed order; marks and sections are captured; page furniture is ignored;
  two questions sharing one OCR line are split apart while `22/7 x 7 x 7` is not.
- **Answer segmentation** — labels the student wrote, continuation blocks,
  answers crossing a page break, crossed-out content, incomplete answers.
- **Mapping** — out-of-order answers land on the right questions; a question with
  no answer stays unanswered; an answer labelled for a question that does not
  exist stays unmatched and is *not* absorbed by content similarity; `11(a)` is
  never treated as a typo of `11(b)`; no answer is ever used twice.
- **Coordinates** — normalized boxes render identically at 0.35×–3× zoom, stay
  inside the page, and never cover it.
- **Computer vision** — thresholding survives a lighting gradient, ruled lines are
  removed while writing above them survives, blocks split on real paragraph gaps.
- **Provider parsing** — JSON recovered from fenced, prefixed and brace-containing
  model output; confidences clamped whether given as `0.85` or `85`.
- **Error handling** — permanent failures stop retrying immediately while transient
  ones back off; timeouts and dropped connections become typed provider errors;
  a rejected key is reported as a key problem even though Gemini returns it as a
  400; and no provider body or stack trace ever reaches the client.
- **Degradation reporting** — an exhausted quota, a rejected key and an unconfigured
  provider produce three different explanations rather than three identical blanks;
  mandatory stages still fail loudly while optional ones degrade and say why.
- **Expected answers** — generated only for unanswered questions, never for attempted
  ones; a declined answer is dropped rather than guessed; key points are capped.

### End-to-end verification

The full flow was run against the generated fixtures with the live Gemini API:
14 questions extracted with correct labels, marks and sub-parts; answers written
out of order mapped correctly; question 7's answer merged across pages 2 and 3;
four questions correctly reported unanswered; the `18`-labelled answer reported
unmatched; grading produced 22/36 with per-question feedback. Clicking a question
navigated the viewer to the right page and highlighted the right region, and the
highlight stayed pinned at 200% zoom.

The same fixtures were then run with `AI_PROVIDER=local` (no API key): all 14
questions were extracted from the printed paper and the answer coordinates were
byte-identical to the Gemini run, with handwriting transcription degraded as
expected.

---

### Reading the answer sheet

The sheet is one continuous scroll, not a page-at-a-time viewer, so an answer
that runs across a page break is followed in a single motion. Page numbers are a
position readout and a nudge, never the only way to move.

Selecting a question scrolls its answer into view and outlines it in green.
Every *other* detected answer stays on the page as a quiet dashed outline that is
itself clickable — so the sheet reads as a map of the whole booklet, and the
teacher can go from a region back to its question as easily as the other way
round.

Three details that took a bug each to get right, all worth knowing if you touch
this code:

- Scrolling is driven imperatively from the click handler, not from an effect
  keyed on the selected region. Re-selecting the question that is already
  selected yields an identical target, so an effect would not re-run and the
  sheet would sit still — exactly what clicking again asks it not to do.
- Scroll offsets come from `getBoundingClientRect`, not `offsetTop`. The results
  panel animates in on mount, and that transform changes what `offsetParent`
  resolves to, silently moving `offsetTop` onto a different origin.
- Each page reserves its box with `aspect-ratio`, so a scroll requested during
  the first paint measures a real height rather than a collapsed one.

### Controls that are not part of this build

The Figma shows the wider VedaAI product: Home, My Classroom, Assignments, My
Library, Settings, notifications, the AI toolkit. Those are drawn because
removing them would misrepresent the design, but each is disabled, lock-marked
and explains itself on hover, focus and tap. Nothing in the interface looks
clickable and then does nothing.

### Expected answers for unanswered questions

A teacher looking at "Unanswered" wants to know what was being asked for, and
writing that out by hand for every skipped question is the tedious part of
marking. `lib/ai/model-answers.ts` writes the answer a well-prepared student
would have given, sized to the question's marks, plus the points a marker would
tick.

It is scoped to unanswered questions only, and deliberately so: generating a
model answer for a question the student *did* attempt would invite reading the
model's version as the mark scheme. The panel is captioned "Written by AI · not
the student's work" so it can never be mistaken for extracted handwriting, and a
question the model declines to answer is dropped rather than filled with a guess.

Cost is bounded — one batched call, at most 20 questions, and no call at all when
nothing was skipped.

### Mandatory vs. optional stages

Document normalisation, region transcription, question extraction, answer
extraction and mapping are **mandatory**: if one fails the run fails, with a
message naming the real cause.

Question structuring, semantic similarity and grading are **optional**. Each sits
on top of deterministic logic that has already produced a result, so a failure
degrades quality rather than the run. Every degradation carries a typed reason
(`quota`, `credentials`, `misconfigured`, `network`, `provider_unavailable`,
`unusable_response`, `not_configured`) all the way to the results screen, where
causes the teacher can act on are shown in red and the rest in amber. A key that
expires mid-run therefore produces an explicit "AI quota ran out during this run"
notice, not a silently missing grading column.

## Limitations

These are real, and the app is built to show them rather than hide them.

- **Handwriting quality is the ceiling.** Faint pencil, heavy slant, cramped
  spacing or a low-resolution scan all degrade transcription. Low-confidence
  answers are flagged; they are not silently trusted.
- **Answers with no label and no distinctive content** may stay unmatched. This is
  deliberate: the app leaves a question unanswered rather than guessing.
- **Complex layouts** — multi-column papers, dense tables, or questions boxed
  inside graphics can confuse the projection-profile segmenter, which assumes
  roughly horizontal lines of text.
- **Diagrams are described, not understood.** A drawn answer is transcribed as
  `[diagram of ...]` and highlighted correctly, but grading it is unreliable.
- **Rotated or badly skewed scans** are not deskewed. Pages are EXIF-rotated only.
- **Free-tier quotas are small.** Gemini's free tier allows **20 requests/day per
  model**, and a five-page run costs roughly 8: one per page, plus mapping,
  grading and expected answers. That is about two full runs a day. Rate limits
  surface as a clear, retryable error rather than a crash, and the progress line
  says "retrying 4/5 — provider overloaded" rather than appearing to freeze.
  Enable billing or use a second project for anything more than light testing.
- **Grading is secondary by design.** It is a single batched call, it degrades to
  "unavailable" without failing the run, and anything the mapper flagged for
  review is flagged in the grade too.
- **Job storage is instance-local** — see [Job storage](#job-storage).

---

## Project structure

```
src/
  app/
    page.tsx                     upload screen
    results/[jobId]/             processing → results (refresh-safe, pollable)
    demo/                        saved sample run
    api/process/                 POST → jobId, GET → status/result, GET → page image
  components/
    shell/  upload/  processing/  results/  answer-viewer/  ui/
  lib/
    ai/          provider contracts, gemini | anthropic | local, prompts, grading
    document/    pdf (PDFium WASM), images (sharp), normalise + validate
    vision/      segmentation (the CV that produces every coordinate), transcribe
    extraction/  questions, answers
    mapping/     normalize-label, deterministic, semantic, mapper
    processing/  pipeline, job-store, stages
    types/       assessment.ts — the whole domain model
  test/          137 tests
scripts/
  make-fixtures.mjs              generates the test question paper + answer sheet
  capture-demo.ts                freezes a real run into the demo dataset
```
