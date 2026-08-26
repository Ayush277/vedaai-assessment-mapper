import "server-only";
import { config } from "@/lib/config";
import type { DegradationKind } from "@/lib/types/assessment";

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
  /**
   * Called when a request is being retried. A stalling provider otherwise
   * leaves the progress UI on the same line for minutes, which reads as a
   * frozen app rather than as work still in progress.
   */
  onRetry?: (note: string) => void;
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

/**
 * The result of an optional AI call.
 *
 * These calls must never throw — they sit on top of deterministic logic that
 * has already produced an answer. But returning a bare `null` loses the one
 * thing the user needs: *why* it did not run. An expired key and an unset key
 * produce identical output otherwise.
 */
export type OptionalCall<T> =
  | { ok: true; value: T }
  | { ok: false; kind: DegradationKind };

export function classifyDegradation(error: unknown): DegradationKind {
  if (error instanceof ProviderAuthError) return "credentials";
  if (error instanceof ProviderNetworkError) return "network";
  if (error instanceof ProviderError) {
    if (error.isRateLimit) return "quota";
    if ((error.status ?? 0) >= 500) return "provider_unavailable";
    if (error.isPermanent) return "misconfigured";
    return "network";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/\bfetch\b|network|timeout|timed out|abort|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return "network";
  }
  return "unusable_response";
}

/** One sentence per cause, written for a teacher rather than an operator. */
/** Short progress line for a retry in flight, e.g. "retrying (2/5) — timed out". */
export function describeRetry(notice: RetryNotice): string {
  const cause =
    notice.kind === "quota"
      ? "provider quota reached"
      : notice.kind === "network"
        ? "connection stalled"
        : notice.kind === "provider_unavailable"
          ? "provider overloaded"
          : "provider error";
  const seconds = Math.round(notice.waitMs / 1000);
  return `retrying ${notice.attempt}/${notice.attempts} — ${cause}${
    seconds > 2 ? `, waiting ${seconds}s` : ""
  }`;
}

export function describeDegradation(
  kind: DegradationKind,
  step: string,
): string {
  switch (kind) {
    case "quota":
      return `The AI provider's quota ran out during this run, so ${step} was skipped. Everything else completed normally — try again once the quota resets.`;
    case "credentials":
      return `The AI provider rejected the configured key, so ${step} was skipped. Check AI_API_KEY.`;
    case "misconfigured":
      return `The AI provider rejected the request, so ${step} was skipped. Check that AI_MODEL names a model this key can use.`;
    case "network":
      return `The connection to the AI service dropped, so ${step} was skipped. Trying again usually resolves it.`;
    case "provider_unavailable":
      return `The AI model was temporarily overloaded, so ${step} was skipped. Trying again usually resolves it.`;
    case "not_configured":
      return `${step[0].toUpperCase()}${step.slice(1)} needs a configured AI provider, so it was skipped.`;
    case "unusable_response":
    default:
      return `The AI service returned something unusable, so ${step} was skipped.`;
  }
}

export interface EmbeddingProvider {
  /** Never throws; reports why it could not run so callers can explain it. */
  embed(texts: string[]): Promise<OptionalCall<number[][]>>;
}

export interface ReasoningProvider {
  /** Never throws; reports why it could not run so callers can explain it. */
  completeJson(params: {
    system: string;
    prompt: string;
    maxOutputTokens?: number;
  }): Promise<OptionalCall<unknown>>;
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

export type RetryNotice = {
  attempt: number;
  attempts: number;
  waitMs: number;
  kind: DegradationKind;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  {
    attempts = 5,
    baseDelayMs = 800,
    onRetry,
  }: {
    attempts?: number;
    baseDelayMs?: number;
    onRetry?: (notice: RetryNotice) => void;
  } = {},
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
        const waitMs = Math.min(
          MAX_RATE_LIMIT_WAIT_MS,
          Math.max(hinted, fallback),
        );
        onRetry?.({
          attempt: attempt + 1,
          attempts,
          waitMs,
          kind: classifyDegradation(error),
        });
        await sleep(waitMs);
        continue;
      }

      const waitMs = baseDelayMs * 2 ** attempt + Math.random() * 250;
      onRetry?.({
        attempt: attempt + 1,
        attempts,
        waitMs,
        kind: classifyDegradation(error),
      });
      await sleep(waitMs);
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
