import "server-only";
import {
  chunkRegions,
  classifyDegradation,
  describeRetry,
  fetchWithTimeout,
  ProviderAuthError,
  ProviderError,
  RateLimitError,
  withRetry,
  type EmbeddingProvider,
  type ProviderBundle,
  type ReasoningProvider,
  type RegionTranscription,
  type TranscribeInput,
  type VisionProvider,
} from "../provider";
import {
  asArray,
  asBoolean,
  asConfidence,
  asNumber,
  asString,
  extractJson,
} from "../json";
import { HANDWRITTEN_SYSTEM, PRINTED_SYSTEM } from "../prompts";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Gemini returns a RetryInfo block with a "retryDelay": "31s" field. */
function parseRetryDelay(body: string): number | undefined {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Gemini answers an invalid key with 400 INVALID_ARGUMENT, not 401, so the
 * status has to be read together with the body to tell a bad key apart from a
 * bad request.
 */
function isAuthFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  return /api[ _-]?key not valid|api[ _-]?key.*invalid|invalid.*api[ _-]?key|API_KEY_INVALID|permission denied|unauthenticated/i.test(
    body,
  );
}

function parseRetryAfterHeader(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function generate(params: {
  apiKey: string;
  model: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
  const { apiKey, model, system, parts, maxOutputTokens = 8192 } = params;

  const response = await fetchWithTimeout(
    `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Deliberately does not echo the key or full request back to the caller.
    if (response.status === 429) {
      throw new RateLimitError(
        `Gemini rate limit reached: ${detail.slice(0, 200)}`,
        parseRetryDelay(detail) ?? parseRetryAfterHeader(response),
      );
    }
    if (isAuthFailure(response.status, detail)) {
      throw new ProviderAuthError(
        `Gemini rejected the credentials: ${detail.slice(0, 200)}`,
        response.status,
      );
    }
    throw new ProviderError(
      `Gemini request failed (${response.status}): ${detail.slice(0, 300)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");

  if (!text) throw new ProviderError("Gemini returned an empty response.");
  return text;
}

function parseRegions(raw: string, expected: number[]): RegionTranscription[] {
  const json = extractJson(raw);
  const rows = asArray(
    json && typeof json === "object" && "regions" in (json as object)
      ? (json as { regions: unknown }).regions
      : json,
  );

  const byIndex = new Map<number, RegionTranscription>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const index = asNumber(record.index, Number.NaN);
    if (!Number.isInteger(index)) continue;
    const label = asString(record.label).trim();
    byIndex.set(index, {
      index,
      text: asString(record.text).trim(),
      label: label && label.toLowerCase() !== "null" ? label : undefined,
      confidence: asConfidence(record.confidence, 0.6),
      isContinuation: asBoolean(record.isContinuation),
      struckOut: asBoolean(record.struckOut),
    });
  }

  // A model that skips a region must not silently drop that page area.
  return expected.map(
    (index) =>
      byIndex.get(index) ?? {
        index,
        text: "",
        confidence: 0,
        isContinuation: false,
        struckOut: false,
      },
  );
}

function buildParts(input: TranscribeInput, batch: TranscribeInput["regions"]): Part[] {
  const parts: Part[] = [
    {
      text: input.previousPageTail
        ? `Page ${input.pageNumber} of ${input.pageCount}. The previous page ended with: "${input.previousPageTail}". If region ${batch[0]?.index} continues that sentence or paragraph, mark it isContinuation: true.\nFull page for context:`
        : `Page ${input.pageNumber} of ${input.pageCount}. Full page for context:`,
    },
    {
      inline_data: {
        mime_type: "image/jpeg",
        data: input.pageContext.toString("base64"),
      },
    },
    {
      text: `Now transcribe these ${batch.length} region crop(s) from that page.`,
    },
  ];

  for (const region of batch) {
    parts.push({ text: `Region ${region.index}:` });
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: region.jpeg.toString("base64"),
      },
    });
  }

  parts.push({
    text: `Return one JSON entry per region, using exactly these index values: ${batch
      .map((region) => region.index)
      .join(", ")}.`,
  });

  return parts;
}

function createVision(apiKey: string, model: string): VisionProvider {
  const run = async (
    input: TranscribeInput,
    system: string,
  ): Promise<RegionTranscription[]> => {
    if (input.regions.length === 0) return [];
    const results: RegionTranscription[] = [];

    for (const batch of chunkRegions(input.regions)) {
      const raw = await withRetry(
        () =>
          generate({ apiKey, model, system, parts: buildParts(input, batch) }),
        {
          onRetry: (notice) => input.onRetry?.(describeRetry(notice)),
        },
      );
      results.push(...parseRegions(raw, batch.map((region) => region.index)));
    }

    return results;
  };

  return {
    id: "gemini",
    model,
    degraded: false,
    transcribePrinted: (input) => run(input, PRINTED_SYSTEM),
    transcribeHandwritten: (input) => run(input, HANDWRITTEN_SYSTEM),
  };
}

function createReasoning(apiKey: string, model: string): ReasoningProvider {
  return {
    async completeJson({ system, prompt, maxOutputTokens }) {
      try {
        const raw = await withRetry(
          () =>
            generate({
              apiKey,
              model,
              system,
              parts: [{ text: prompt }],
              maxOutputTokens,
            }),
          { attempts: 2 },
        );
        const parsed = extractJson(raw);
        if (parsed === null) {
          console.warn("[gemini] reasoning returned unparseable JSON.");
          return { ok: false, kind: "unusable_response" };
        }
        return { ok: true, value: parsed };
      } catch (error) {
        // Reasoning is an enhancement over deterministic logic that has already
        // run, so a failure degrades quality but never the run. The cause is
        // both logged and returned, so the results screen can explain it.
        console.warn("[gemini] reasoning call failed, continuing without it:", error);
        return { ok: false, kind: classifyDegradation(error) };
      }
    },
  };
}

function createEmbeddings(apiKey: string, model: string): EmbeddingProvider {
  return {
    async embed(texts) {
      if (texts.length === 0) return { ok: true, value: [] };
      try {
        const response = await withRetry(
          () =>
            fetchWithTimeout(
              `${API_ROOT}/models/${encodeURIComponent(model)}:batchEmbedContents`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": apiKey,
                },
                body: JSON.stringify({
                  requests: texts.map((text) => ({
                    model: `models/${model}`,
                    content: { parts: [{ text: text.slice(0, 8000) }] },
                    taskType: "SEMANTIC_SIMILARITY",
                  })),
                }),
              },
              45_000,
            ),
          { attempts: 2 },
        );

        if (!response.ok) {
          console.warn(
            `[gemini] embeddings unavailable (${response.status}); falling back to lexical similarity.`,
          );
          const detail = await response.text().catch(() => "");
          return {
            ok: false,
            kind: classifyDegradation(
              response.status === 429
                ? new RateLimitError(detail.slice(0, 120))
                : new ProviderError(detail.slice(0, 120), response.status),
            ),
          };
        }
        const payload = (await response.json()) as {
          embeddings?: { values?: number[] }[];
        };
        const vectors = payload.embeddings?.map((entry) => entry.values ?? []);
        if (!vectors || vectors.length !== texts.length) {
          console.warn(
            "[gemini] embeddings response did not match the request; falling back to lexical similarity.",
          );
          return { ok: false, kind: "unusable_response" };
        }
        return { ok: true, value: vectors };
      } catch (error) {
        console.warn(
          "[gemini] embeddings call failed; falling back to lexical similarity:",
          error,
        );
        return { ok: false, kind: classifyDegradation(error) };
      }
    },
  };
}

export function createGeminiProviders(
  apiKey: string,
  model: string,
  embeddingModel: string,
): ProviderBundle {
  if (!apiKey) throw new ProviderError("Gemini provider requires AI_API_KEY.");
  return {
    vision: createVision(apiKey, model),
    embeddings: createEmbeddings(apiKey, embeddingModel),
    reasoning: createReasoning(apiKey, model),
  };
}
