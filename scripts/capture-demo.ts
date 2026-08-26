/**
 * Captures a completed processing job into the bundled demo dataset.
 *
 * The demo is a real pipeline output, not hand-written fixtures: the questions,
 * answers, coordinates and page images all come from an actual run over the
 * files in `fixtures/`. Only the expensive vision stage is frozen — the mapping
 * stage is re-run here with the current code and no AI provider, so the sample
 * always reflects how the mapper behaves today.
 *
 * Usage: npm run capture:demo -- <jobId>
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mapAnswersToQuestions } from "../src/lib/mapping/mapper";
import type {
  AssessmentResult,
  JobRecord,
  ResultSummary,
} from "../src/lib/types/assessment";

const JOB_ROOT = path.join(os.tmpdir(), "vedaai-jobs");
const PUBLIC_DIR = path.resolve("public/demo");
const OUT_FILE = path.resolve("src/lib/demo/sample-result.json");

async function main() {
  const jobId = process.argv[2];
  if (!jobId) throw new Error("Usage: npm run capture:demo -- <jobId>");

  const raw = await fs.readFile(path.join(JOB_ROOT, jobId, "job.json"), "utf8");
  const job = JSON.parse(raw) as JobRecord;
  if (job.status !== "completed" || !job.result) {
    throw new Error(`Job ${jobId} is ${job.status}, not a completed run.`);
  }

  const source = job.result;

  // Re-run mapping with today's code so the sample never ships stale behaviour.
  const mapping = await mapAnswersToQuestions(source.questions, source.answers, {
    embeddings: null,
    reasoning: null,
  });

  const summary: ResultSummary = {
    totalQuestions: source.questions.length,
    answered: mapping.mappings.filter((m) => m.status === "matched").length,
    unanswered: mapping.mappings.filter((m) => m.status === "unanswered").length,
    needsReview: mapping.mappings.filter((m) => m.status === "needs_review").length,
    unmatchedAnswers: mapping.unmatchedAnswerIds.length,
  };

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });

  // Copy the rendered page images out of the job store and repoint the URLs at
  // static assets, so the demo needs no job store and no API calls at all.
  const documents = [source.questionPaper, source.answerSheet];
  for (const document of documents) {
    for (const page of document.pages) {
      const file = `${document.kind}-${page.pageNumber}.png`;
      await fs.copyFile(
        path.join(JOB_ROOT, jobId, file),
        path.join(PUBLIC_DIR, file),
      );
      page.imageUrl = `/demo/${file}`;
    }
  }

  const result: AssessmentResult = {
    ...source,
    jobId: "demo",
    mappings: mapping.mappings,
    unmatchedAnswerIds: mapping.unmatchedAnswerIds,
    summary,
    warnings: [
      "This is a saved sample run, not a live extraction.",
      ...source.warnings.filter((warning) => !/need review/i.test(warning)),
      ...(summary.needsReview > 0
        ? [`${summary.needsReview} answer(s) need review before you rely on the match.`]
        : []),
    ],
    isDemo: true,
  };

  await fs.writeFile(OUT_FILE, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(`captured job ${jobId}`);
  console.log(
    `  ${result.questions.length} questions, ${result.answers.length} answers`,
  );
  console.log(`  ${JSON.stringify(summary)}`);
  console.log(`  pages -> ${PUBLIC_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
