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
  return create("eng", 1, { logger: () => {} });
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker();
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
    const worker = await getWorker();
    const results: RegionTranscription[] = [];

    for (const region of input.regions) {
      try {
        const { data } = await worker.recognize(region.jpeg);
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
