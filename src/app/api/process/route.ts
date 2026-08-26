import { after, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { DocumentError, validateUpload } from "@/lib/document/normalize";
import { createJob, runPipeline } from "@/lib/processing/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Rasterising and reading several scanned pages takes real time. */
export const maxDuration = 300;

type FieldName = "questionPaper" | "answerSheet";

const FIELD_LABELS: Record<FieldName, string> = {
  questionPaper: "a question paper",
  answerSheet: "an answer sheet",
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("The upload could not be read. Please try again.");
  }

  const files: Partial<Record<FieldName, File>> = {};

  for (const field of ["questionPaper", "answerSheet"] as FieldName[]) {
    const value = form.get(field);
    if (!value || typeof value === "string") {
      return badRequest(`Please upload ${FIELD_LABELS[field]}.`);
    }
    try {
      validateUpload({ name: value.name, type: value.type, size: value.size });
    } catch (error) {
      if (error instanceof DocumentError) return badRequest(error.message);
      return badRequest(`The ${FIELD_LABELS[field].replace(/^an? /, "")} could not be validated.`);
    }
    files[field] = value;
  }

  const questionPaper = files.questionPaper!;
  const answerSheet = files.answerSheet!;

  const [paperBytes, sheetBytes] = await Promise.all([
    questionPaper.arrayBuffer(),
    answerSheet.arrayBuffer(),
  ]);

  if (paperBytes.byteLength === 0 || sheetBytes.byteLength === 0) {
    return badRequest("One of the uploaded files is empty.");
  }

  const job = await createJob(config.gradingEnabled);

  // Respond immediately with the job id; the pipeline continues in the
  // background. `after()` keeps the work alive on serverless platforms that
  // would otherwise freeze the instance once the response is flushed.
  after(async () => {
    try {
      await runPipeline({
        jobId: job.id,
        questionPaper: {
          fileName: questionPaper.name,
          mimeType: questionPaper.type,
          bytes: new Uint8Array(paperBytes),
        },
        answerSheet: {
          fileName: answerSheet.name,
          mimeType: answerSheet.type,
          bytes: new Uint8Array(sheetBytes),
        },
      });
    } catch (error) {
      // runPipeline records its own failures, so reaching here means even that
      // bookkeeping failed. Swallow it: an unhandled rejection in a background
      // task would take the whole server down instead of one job.
      console.error(`[api/process] background run ${job.id} threw:`, error);
    }
  });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
