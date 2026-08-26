import { describe, expect, it, vi } from "vitest";
import {
  ProviderAuthError,
  ProviderError,
  ProviderNetworkError,
  RateLimitError,
  fetchWithTimeout,
  withRetry,
} from "@/lib/ai/provider";

/** Keep the pacer out of the way; timing is not what these tests are about. */
process.env.PROVIDER_MIN_INTERVAL_MS = "0";

describe("ProviderError classification", () => {
  it("treats 4xx other than 429 as permanent", () => {
    expect(new ProviderError("bad model", 404).isPermanent).toBe(true);
    expect(new ProviderError("unauthorized", 401).isPermanent).toBe(true);
    expect(new ProviderError("rate limited", 429).isPermanent).toBe(false);
    expect(new ProviderError("overloaded", 503).isPermanent).toBe(false);
  });

  it("does not mark a transport failure as permanent", () => {
    // No status means the request never reached the service, so it is worth
    // retrying rather than reporting as a bad request.
    const error = new ProviderNetworkError("connection reset");
    expect(error.isPermanent).toBe(false);
    expect(error.isRateLimit).toBe(false);
    expect(error).toBeInstanceOf(ProviderError);
  });

  it("carries the provider's own backoff hint", () => {
    expect(new RateLimitError("slow down", 31).retryAfterSeconds).toBe(31);
    expect(new RateLimitError("slow down").isRateLimit).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    const operation = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(operation, { attempts: 3 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new ProviderNetworkError("reset"))
      .mockResolvedValue("ok");

    await expect(
      withRetry(operation, { attempts: 3, baseDelayMs: 1 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on a permanent error instead of burning attempts", async () => {
    const operation = vi.fn().mockRejectedValue(new ProviderError("no model", 404));

    await expect(
      withRetry(operation, { attempts: 5, baseDelayMs: 1 }),
    ).rejects.toThrow("no model");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error after exhausting attempts", async () => {
    const operation = vi.fn().mockRejectedValue(new ProviderNetworkError("down"));

    await expect(
      withRetry(operation, { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(ProviderNetworkError);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("keeps the pacer usable after a failure", async () => {
    const failing = vi.fn().mockRejectedValue(new ProviderError("nope", 400));
    await expect(withRetry(failing, { attempts: 1 })).rejects.toThrow();

    // A rejected call must not poison the shared queue for later calls.
    const succeeding = vi.fn().mockResolvedValue("still works");
    await expect(withRetry(succeeding, { attempts: 1 })).resolves.toBe(
      "still works",
    );
  });
});

describe("fetchWithTimeout", () => {
  it("converts a timeout into a retryable provider error", async () => {
    const original = globalThis.fetch;
    // Never settles on its own; only the timeout's abort ends it.
    globalThis.fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    try {
      const error = await fetchWithTimeout("https://example.test", {}, 20).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ProviderNetworkError);
      expect((error as Error).message).toMatch(/timed out/i);
      expect((error as ProviderError).isPermanent).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("converts a dropped connection into a provider error", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    try {
      const error = await fetchWithTimeout("https://example.test", {}, 5000).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ProviderNetworkError);
      expect((error as Error).message).toMatch(/could not reach the provider/i);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("provider auth-failure detection", () => {
  /**
   * Reproduces the real bodies each provider returns for a bad key, so the
   * detection cannot drift away from what the APIs actually send.
   */
  async function callGemini(status: number, body: string) {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(body, { status }),
    ) as unknown as typeof fetch;
    try {
      const { createGeminiProviders } = await import("@/lib/ai/providers/gemini");
      const { vision } = createGeminiProviders("k", "m", "e");
      return await vision
        .transcribePrinted({
          pageNumber: 1,
          pageCount: 1,
          pageContext: Buffer.from(""),
          regions: [{ index: 0, jpeg: Buffer.from("") }],
        })
        .catch((error: unknown) => error);
    } finally {
      globalThis.fetch = original;
    }
  }

  it("treats Gemini's 400 'API key not valid' as an auth failure", async () => {
    const error = await callGemini(
      400,
      '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}',
    );
    expect(error).toBeInstanceOf(ProviderAuthError);
    expect((error as ProviderError).isPermanent).toBe(true);
  });

  it("still treats a genuine bad request as a request error, not an auth error", async () => {
    const error = await callGemini(
      400,
      '{"error":{"code":400,"message":"Invalid JSON payload received."}}',
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderAuthError);
  });

  it("treats a 403 as an auth failure whatever the body says", async () => {
    const error = await callGemini(403, '{"error":{"message":"forbidden"}}');
    expect(error).toBeInstanceOf(ProviderAuthError);
  });
});
