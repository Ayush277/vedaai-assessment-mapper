import "server-only";
import {
  chunkRegions,
  fetchWithTimeout,
  ProviderAuthError,
  ProviderError,
  RateLimitError,
  withRetry,
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

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

type Block =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg"; data: string };
    };

async function createMessage(params: {
  apiKey: string;
  model: string;
  system: string;
  blocks: Block[];
  maxTokens?: number;
}): Promise<string> {
  const { apiKey, model, system, blocks, maxTokens = 8192 } = params;

  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: blocks }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header ? Number(header) : Number.NaN;
      throw new RateLimitError(
        `Anthropic rate limit reached: ${detail.slice(0, 200)}`,
        Number.isFinite(seconds) ? seconds : undefined,
      );
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      /authentication_error|invalid x-api-key|invalid api key/i.test(detail)
    ) {
      throw new ProviderAuthError(
        `Anthropic rejected the credentials: ${detail.slice(0, 200)}`,
        response.status,
      );
    }
    throw new ProviderError(
      `Anthropic request failed (${response.status}): ${detail.slice(0, 300)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (!text) throw new ProviderError("Anthropic returned an empty response.");
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

function buildBlocks(
  input: TranscribeInput,
  batch: TranscribeInput["regions"],
): Block[] {
  const blocks: Block[] = [
    {
      type: "text",
      text: input.previousPageTail
        ? `Page ${input.pageNumber} of ${input.pageCount}. The previous page ended with: "${input.previousPageTail}". If region ${batch[0]?.index} continues that sentence or paragraph, mark it isContinuation: true.\nFull page for context:`
        : `Page ${input.pageNumber} of ${input.pageCount}. Full page for context:`,
    },
    {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: input.pageContext.toString("base64"),
      },
    },
    { type: "text", text: `Now transcribe these ${batch.length} region crop(s).` },
  ];

  for (const region of batch) {
    blocks.push({ type: "text", text: `Region ${region.index}:` });
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: region.jpeg.toString("base64"),
      },
    });
  }

  blocks.push({
    type: "text",
    text: `Return one JSON entry per region using exactly these index values: ${batch
      .map((region) => region.index)
      .join(", ")}. Respond with JSON only.`,
  });

  return blocks;
}

function createVision(apiKey: string, model: string): VisionProvider {
  const run = async (
    input: TranscribeInput,
    system: string,
  ): Promise<RegionTranscription[]> => {
    if (input.regions.length === 0) return [];
    const results: RegionTranscription[] = [];
    for (const batch of chunkRegions(input.regions)) {
      const raw = await withRetry(() =>
        createMessage({ apiKey, model, system, blocks: buildBlocks(input, batch) }),
      );
      results.push(...parseRegions(raw, batch.map((region) => region.index)));
    }
    return results;
  };

  return {
    id: "anthropic",
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
            createMessage({
              apiKey,
              model,
              system,
              blocks: [{ type: "text", text: prompt }],
              maxTokens: maxOutputTokens,
            }),
          { attempts: 2 },
        );
        return extractJson(raw);
      } catch (error) {
        console.warn(
          "[anthropic] reasoning call failed, continuing without it:",
          error,
        );
        return null;
      }
    },
  };
}

export function createAnthropicProviders(
  apiKey: string,
  model: string,
): ProviderBundle {
  if (!apiKey) throw new ProviderError("Anthropic provider requires AI_API_KEY.");
  return {
    vision: createVision(apiKey, model),
    // Anthropic has no embedding endpoint; the mapper falls back to its
    // deterministic lexical similarity, which needs no network at all.
    embeddings: null,
    reasoning: createReasoning(apiKey, model),
  };
}
