import { NextResponse } from "next/server";
import { DocumentError, validateUpload } from "@/lib/document/normalize";
import { runPipeline } from "@/lib/processing/pipeline";
import type { JobRecord } from "@/lib/types/assessment";
import { stageProgressPercent } from "@/lib/processing/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Rasterising and reading several scanned pages takes real time. */
export const maxDuration = 300;

/** Upper bound on one batch, so a stray multi-select cannot start a huge run. */
const MAX_STUDENTS = 20;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status });
}

/**
 * Runs the pipeline and streams progress back on the same request.
 *
 * The previous design returned a job id and let the client poll for it, with
 * state written to `os.tmpdir()`. That is per-instance: on a serverless host
 * the upload lands on one instance and every poll lands on another, so the job
 * the client was just told about did not exist anywhere it could look. Keeping
 * the whole run inside one request removes the need to share anything at all —
 * and gives finer-grained progress than polling did.
 *
 * The response is newline-delimited JSON: a run of `stage` frames, then exactly
 * one `result` or `error` frame.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("The upload could not be read. Please try again.");
  }

  const paper = form.get("questionPaper");
  if (!paper || typeof paper === "string") {
    return badRequest("Please upload a question paper.");
  }
  try {
    validateUpload({ name: paper.name, type: paper.type, size: paper.size });
  } catch (error) {
    if (error instanceof DocumentError) return badRequest(error.message);
    return badRequest("The question paper could not be validated.");
  }

  // One field, many files: a class is uploaded in a single go.
  const sheets = form
    .getAll("answerSheets")
    .filter((value): value is File => typeof value !== "string" && value !== null);

  if (sheets.length === 0) {
    return badRequest("Please upload at least one student answer sheet.");
  }
  if (sheets.length > MAX_STUDENTS) {
    return badRequest(
      `That is ${sheets.length} answer sheets. Upload at most ${MAX_STUDENTS} at a time.`,
    );
  }
  for (const sheet of sheets) {
    try {
      validateUpload({ name: sheet.name, type: sheet.type, size: sheet.size });
    } catch (error) {
      if (error instanceof DocumentError) return badRequest(error.message);
      return badRequest(`"${sheet.name}" could not be validated.`);
    }
  }

  const paperBytes = await paper.arrayBuffer();
  const sheetBuffers = await Promise.all(sheets.map((s) => s.arrayBuffer()));

  if (paperBytes.byteLength === 0 || sheetBuffers.some((b) => b.byteLength === 0)) {
    return badRequest("One of the uploaded files is empty.");
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          /* client hung up; the run finishes and is discarded */
        }
      };

      const sendStage = (record: JobRecord) =>
        send({
          type: "stage",
          status: record.status,
          stages: record.stages,
          progress: stageProgressPercent(record.stages),
        });

      try {
        const record = await runPipeline({
          questionPaper: {
            fileName: paper.name,
            mimeType: paper.type,
            bytes: new Uint8Array(paperBytes),
          },
          answerSheets: sheets.map((sheet, index) => ({
            fileName: sheet.name,
            mimeType: sheet.type,
            bytes: new Uint8Array(sheetBuffers[index]),
          })),
          onProgress: sendStage,
        });

        if (record.status === "completed" && record.result) {
          send({ type: "result", result: record.result });
        } else {
          send({
            type: "error",
            error: record.error ?? {
              code: "INTERNAL",
              message: "Processing did not complete.",
              retryable: true,
            },
          });
        }
      } catch (error) {
        console.error("[api/process] run threw:", error);
        send({
          type: "error",
          error: {
            code: "INTERNAL",
            message: "Something went wrong while processing these files.",
            retryable: true,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Proxies that buffer would defeat the point of streaming progress.
      "X-Accel-Buffering": "no",
    },
  });
}
