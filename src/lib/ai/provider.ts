import "server-only";
import { config } from "@/lib/config";

/* -------------------------------------------------------------------------- */
/*                              Provider contracts                            */
/* -------------------------------------------------------------------------- */

export type RegionImage = {
  /** Index of the layout block this crop came from. */
  index: number;
  jpeg: Buffer;
};

export type TranscribeInput = {
  pageNumber: number;
  pageCount: number;
  regions: RegionImage[];
  /** Whole-page thumbnail supplied as spatial context for the crops. */
  pageContext: Buffer;
  /**
   * Tail of the last region read on the previous page. Each page is its own
   * request, so without this the reader has no way to tell that the first
   * region of a page finishes a sentence begun on the page before.
   */
  previousPageTail?: string;
};

export type RegionTranscription = {
  index: number;
  text: string;
  /** Question label printed/written at the start of this region, if present. */
  label?: string;
  confidence: number;
  /** Region reads as the tail of the previous region rather than a new item. */
  isContinuation: boolean;
  /** Region is crossed out / cancelled by the writer. */
  struckOut: boolean;
};

export interface VisionProvider {
  readonly id: string;
  readonly model: string;
  /** True when this provider cannot do real vision reasoning (local OCR). */
  readonly degraded: boolean;
  transcribePrinted(input: TranscribeInput): Promise<RegionTranscription[]>;
  transcribeHandwritten(input: TranscribeInput): Promise<RegionTranscription[]>;
}

export interface EmbeddingProvider {
  /** Returns null when embeddings are unavailable, so callers can fall back. */
  embed(texts: string[]): Promise<number[][] | null>;
}

export interface ReasoningProvider {
  /** Structured JSON completion. Returns null on any failure — never throws. */
  completeJson(params: {
    system: string;
    prompt: string;
    maxOutputTokens?: number;
  }): Promise<unknown | null>;
}

export type ProviderBundle = {
  vision: VisionProvider;
  embeddings: EmbeddingProvider | null;
  reasoning: ReasoningProvider | null;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    /** Seconds the provider asked us to wait, when it says so. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  /** 4xx other than 429 will not succeed on retry. */
  get isPermanent(): boolean {
    return (
      typeof this.status === "number" &&
      this.status >= 400 &&
      this.status < 500 &&
      this.status !== 429
    );
  }
}

export class RateLimitError extends ProviderError {
  constructor(message: string, retryAfterSeconds?: number) {
    super(message, 429, retryAfterSeconds);
    this.name = "RateLimitError";
  }
}

/**
 * The configured credentials were rejected.
 *
 * This is its own type because the HTTP status alone does not identify it:
 * Gemini reports an invalid key as 400, which is indistinguishable from a
 * malformed request unless you read the body. Each provider recognises its own
 * shape and throws this, so the pipeline can tell the operator to check the key
 * rather than sending them to look at the model name.
 */
export class ProviderAuthError extends ProviderError {
  constructor(message: string, status = 401) {
    super(message, status);
    this.name = "ProviderAuthError";
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Factory                                  */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the configured provider. Swapping vendors is a config change plus
 * one file in `providers/` — nothing else in the pipeline imports a vendor SDK.
 */
export async function getProviders(): Promise<ProviderBundle> {
  switch (config.providerId) {
    case "gemini": {
      const { createGeminiProviders } = await import("./providers/gemini");
      return createGeminiProviders(config.apiKey, config.model, config.embeddingModel);
    }
    case "anthropic": {
      const { createAnthropicProviders } = await import("./providers/anthropic");
      return createAnthropicProviders(config.apiKey, config.model);
    }
    case "local":
    default: {
      const { createLocalProviders } = await import("./providers/local");
      return createLocalProviders();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serialises provider calls and keeps a floor between them.
 *
 * Free tiers meter requests per minute, and a burst of page requests will trip
 * that limit long before it exhausts a daily quota. Pacing the calls costs a
 * little wall-clock time and avoids the retry storms that follow a 429.
 */
class RequestPacer {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  constructor(private readonly minIntervalMs: number) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.lastStart);
      if (wait > 0) await sleep(wait);
      this.lastStart = Date.now();
      return operation();
    });
    // Keep the chain alive regardless of individual failures.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

let pacer: RequestPacer | null = null;

/**
 * 3.2s between calls is ~18 requests/minute, which sits just under the 20/min
 * free-tier ceiling of the default Gemini model. Paid tiers can drop this to 0.
 */
const DEFAULT_MIN_INTERVAL_MS = 3200;

function getPacer(): RequestPacer {
  if (!pacer) {
    const configured = Number(process.env.PROVIDER_MIN_INTERVAL_MS);
    pacer = new RequestPacer(
      Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_MIN_INTERVAL_MS,
    );
  }
  return pacer;
}

const MAX_RATE_LIMIT_WAIT_MS = 65_000;

export async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts = 5, baseDelayMs = 800 } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getPacer().run(operation);
    } catch (error) {
      lastError = error;

      if (error instanceof ProviderError && error.isPermanent) {
        break; // a bad key or malformed request will not fix itself
      }

      if (attempt === attempts - 1) break;

      // Rate limits and "model overloaded" both need a wait measured in tens
      // of seconds; the usual few hundred milliseconds just burns an attempt.
      const isBackpressure =
        error instanceof ProviderError &&
        (error.isRateLimit || (error.status ?? 0) >= 500);

      if (isBackpressure) {
        const providerError = error as ProviderError;
        const hinted = (providerError.retryAfterSeconds ?? 0) * 1000;
        const fallback = Math.min(MAX_RATE_LIMIT_WAIT_MS, 6_000 * 2 ** attempt);
        await sleep(Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(hinted, fallback)));
        continue;
      }

      await sleep(baseDelayMs * 2 ** attempt + Math.random() * 250);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ProviderError("Provider request failed");
}

export class ProviderNetworkError extends ProviderError {
  constructor(message: string) {
    // No HTTP status: the request never got far enough to have one. That keeps
    // it out of `isPermanent`, so withRetry treats it as worth retrying.
    super(message);
    this.name = "ProviderNetworkError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 90_000,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // A timeout or a dropped connection arrives here as a DOMException or a
    // TypeError, neither of which any caller can classify. Normalising them
    // into ProviderError means retry policy and user-facing messages are
    // decided in exactly one place for every kind of provider failure.
    if (timedOut) {
      throw new ProviderNetworkError(
        `Provider request timed out after ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ProviderNetworkError(`Could not reach the provider: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Split regions into request-sized chunks.
 *
 * Larger batches mean fewer requests, which matters far more than payload size
 * when the binding constraint is a per-minute request quota. Twelve crops per
 * request keeps a typical page to a single call.
 */
export function chunkRegions(
  regions: RegionImage[],
  size = 12,
): RegionImage[][] {
  const chunks: RegionImage[][] = [];
  for (let i = 0; i < regions.length; i += size) {
    chunks.push(regions.slice(i, i + size));
  }
  return chunks;
}
