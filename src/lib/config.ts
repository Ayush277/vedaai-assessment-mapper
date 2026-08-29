import "server-only";

export type ProviderId = "gemini" | "anthropic" | "local";

/**
 * Pinned, not a `-latest` alias.
 *
 * `gemini-flash-latest` drifted onto a reasoning model, and on a reasoning
 * model `maxOutputTokens` is spent on thinking before any text is emitted: a
 * transcription that needs 90 output tokens returned 0 on half the pages,
 * having burned the whole budget thinking about handwriting. It was also ~15x
 * slower per call, which pushed a four-page run past the request timeout. The
 * lite model transcribed the same fixture pages in 12.5s against 194.6s, with
 * identical text where the larger model produced any at all. Transcription is
 * a mechanical task; paying a reasoning model for it buys nothing.
 */
const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-sonnet-5",
  local: "tesseract-eng",
};

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveProvider(): ProviderId {
  const requested = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const key = (process.env.AI_API_KEY ?? "").trim();

  if (requested === "local") return "local";
  if (!key) return "local"; // no key configured -> degrade to local OCR
  if (requested === "anthropic") return "anthropic";
  if (requested === "gemini") return "gemini";
  return "gemini";
}

export const config = {
  get providerId(): ProviderId {
    return resolveProvider();
  },
  get apiKey(): string {
    return (process.env.AI_API_KEY ?? "").trim();
  },
  get model(): string {
    const override = (process.env.AI_MODEL ?? "").trim();
    return override || DEFAULT_MODELS[resolveProvider()];
  },
  get embeddingModel(): string {
    return (process.env.AI_EMBEDDING_MODEL ?? "").trim() || "gemini-embedding-001";
  },
  get gradingEnabled(): boolean {
    return (process.env.ENABLE_GRADING ?? "true").toLowerCase() !== "false";
  },
  get maxUploadBytes(): number {
    return num(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024;
  },
  get maxPagesPerDocument(): number {
    return num(process.env.MAX_PAGES_PER_DOCUMENT, 12);
  },
  /** True when handwriting is being read by local OCR rather than a model. */
  get isDegraded(): boolean {
    return resolveProvider() === "local";
  },
  /**
   * Why local OCR is in use. "chosen" and "no-key" look identical in the
   * output but mean opposite things to whoever is reading the screen: one is a
   * deliberate setting, the other is missing configuration. Telling someone to
   * set a key they have already set is worse than saying nothing.
   */
  get localMode(): "chosen" | "no-key" | null {
    if (resolveProvider() !== "local") return null;
    const requested = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
    if (requested === "local") return "chosen";
    return "no-key";
  },
} as const;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;
