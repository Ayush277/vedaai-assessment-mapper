import "server-only";
import type {
  ProviderBundle,
  RegionTranscription,
  TranscribeInput,
  VisionProvider,
} from "../provider";

/**
 * Zero-configuration fallback: Tesseract OCR running locally.
 *
 * This exists so the application is genuinely usable with no API key — the
 * uploaded files still flow through the real pipeline and the coordinates are
 * still real, because coordinates come from `lib/vision`, not from the reader.
 *
 * It is honestly weaker than a vision model: Tesseract does well on printed
 * question papers and poorly on cursive handwriting. Runs using it are marked
 * `degraded` so the UI can say so rather than presenting shaky output as
 * confident output.
 */

type Worker = Awaited<ReturnType<typeof createWorker>>;

async function createWorker() {
  const { createWorker: create } = await import("tesseract.js");
  const os = await import("node:os");

  // Tesseract caches its ~5MB language data on disk on first use, and defaults
  // to the current working directory. That directory is read-only on serverless
  // hosts, so the download throws and takes the whole run down. The OS temp
  // directory is the one writable path on every target, and the file survives
  // for the life of the instance so warm invocations skip the download.
  return create("eng", 1, {
    logger: () => {},
    cachePath: os.tmpdir(),
  });
}

/**
 * How long to wait for the OCR worker to come up.
 *
 * Tesseract runs as a WASM worker that fetches its core and language data on
 * first use. On some serverless runtimes that worker never starts and the call
 * simply never settles — the run hangs until the platform kills it, and the
 * client sees a progress line frozen on the same stage for minutes. Bounding
 * the wait turns that into a fast, explainable failure.
 */
const WORKER_STARTUP_TIMEOUT_MS = 25_000;
/** A single page should never take this long once the worker is up. */
const PAGE_TIMEOUT_MS = 40_000;

class LocalOcrUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalOcrUnavailableError";
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new LocalOcrUnavailableError(`${what} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

let workerPromise: Promise<Worker> | null = null;

/**
 * The worker downloads its language data on first use, so it is created once
 * and reused. The memo is cleared on failure — caching a rejected promise
 * would mean one flaky download permanently disabled OCR for the process.
 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = withTimeout(
      createWorker(),
      WORKER_STARTUP_TIMEOUT_MS,
      "Local OCR worker startup",
    ).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** Tesseract's per-word confidence is 0..100; the pipeline speaks 0..1. */
function scaleConfidence(value: number): number {
  return Math.min(1, Math.max(0, value / 100));
}

const LABEL_PATTERN =
  /^\s*(?:ans(?:wer)?\.?\s*)?(?:q(?:uestion)?\s*)?(\d{1,2}\s*(?:[.)\-:]|\s)?\s*(?:\(\s*[a-zA-Z]{1,3}\s*\)|[a-z]\)|\([ivx]{1,4}\))?)/i;

function detectLabel(text: string): string | undefined {
  const firstLine = text.split(/\n/, 1)[0] ?? "";
  const match = firstLine.match(LABEL_PATTERN);
  if (!match) return undefined;
  const label = match[1]?.trim().replace(/[.:)]$/, "").trim();
  return label && /\d/.test(label) ? label : undefined;
}

function createVision(): VisionProvider {
  const run = async (input: TranscribeInput): Promise<RegionTranscription[]> => {
    if (input.regions.length === 0) return [];
    let worker: Worker;
    try {
      worker = await getWorker();
    } catch (error) {
      // Nothing can be read without a worker, so fail loudly rather than
      // returning a page of empty transcriptions that look like a blank sheet.
      throw new LocalOcrUnavailableError(
        "Local OCR could not start in this environment. Configure an AI provider (AI_API_KEY) to process documents here.",
        { cause: error },
      );
    }

    const results: RegionTranscription[] = [];

    for (const region of input.regions) {
      try {
        const { data } = await withTimeout(
          worker.recognize(region.jpeg),
          PAGE_TIMEOUT_MS,
          "Local OCR",
        );
        const text = (data.text ?? "").replace(/\s+\n/g, "\n").trim();
        results.push({
          index: region.index,
          text,
          label: detectLabel(text),
          confidence: text ? scaleConfidence(data.confidence ?? 0) : 0,
          isContinuation: false,
          struckOut: false,
        });
      } catch {
        results.push({
          index: region.index,
          text: "",
          confidence: 0,
          isContinuation: false,
          struckOut: false,
        });
      }
    }

    return results;
  };

  return {
    id: "local",
    model: "tesseract-eng",
    degraded: true,
    transcribePrinted: run,
    transcribeHandwritten: run,
  };
}

export function createLocalProviders(): ProviderBundle {
  return {
    vision: createVision(),
    // No network calls at all in this mode. The mapper's lexical similarity
    // and the deterministic rules carry the whole matching stage.
    embeddings: null,
    reasoning: null,
  };
}
