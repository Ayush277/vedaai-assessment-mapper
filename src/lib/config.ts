import "server-only";

export type ProviderId = "gemini" | "anthropic" | "local";

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-flash-latest",
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
  /** True when running without a configured AI provider. */
  get isDegraded(): boolean {
    return resolveProvider() === "local";
  },
} as const;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;
