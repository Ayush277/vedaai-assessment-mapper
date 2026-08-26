import { describe, expect, it } from "vitest";
import { toJobError } from "@/lib/processing/pipeline";
import {
  ProviderAuthError,
  ProviderError,
  ProviderNetworkError,
  RateLimitError,
} from "@/lib/ai/provider";
import { DocumentError } from "@/lib/document/normalize";

/**
 * This function decides what a teacher is told when a run fails. Getting the
 * classification wrong sends them to fix the wrong thing — re-scanning a
 * perfectly good paper because the network dropped, for instance.
 */
describe("toJobError", () => {
  it("passes a document problem through verbatim and marks it unretryable", () => {
    const error = new DocumentError("CORRUPT", '"paper.pdf" could not be opened.');
    const job = toJobError(error, "uploading");

    expect(job.code).toBe("INVALID_FILE");
    expect(job.message).toBe('"paper.pdf" could not be opened.');
    expect(job.retryable).toBe(false);
  });

  it("reports an empty document with its own code", () => {
    const job = toJobError(
      new DocumentError("EMPTY_FILE", '"sheet.pdf" is empty.'),
      "uploading",
    );
    expect(job.code).toBe("EMPTY_DOCUMENT");
    expect(job.retryable).toBe(false);
  });

  it("blames the quota, not the document, when rate limited mid-read", () => {
    const job = toJobError(
      new RateLimitError("quota exceeded", 30),
      "reading-answer-sheet",
    );
    expect(job.code).toBe("PROVIDER_ERROR");
    expect(job.message).toMatch(/rate limited/i);
    expect(job.retryable).toBe(true);
  });

  it("blames credentials, not the document, when the key is rejected", () => {
    const job = toJobError(
      new ProviderAuthError("unauthorized", 401),
      "reading-question-paper",
    );
    expect(job.code).toBe("PROVIDER_ERROR");
    expect(job.message).toMatch(/credentials/i);
    expect(job.message).toMatch(/AI_API_KEY/);
    expect(job.retryable).toBe(false);
  });

  it("blames the key, not the model, when the provider reports a bad key as 400", () => {
    // Gemini answers an invalid key with 400, which would otherwise be read as
    // a bad model name and send the operator to the wrong setting.
    const job = toJobError(
      new ProviderAuthError("API key not valid. Please pass a valid API key.", 400),
      "reading-question-paper",
    );
    expect(job.message).toMatch(/AI_API_KEY/);
    expect(job.message).not.toMatch(/AI_MODEL/);
  });

  it("tells the operator the model name is wrong on a 404", () => {
    const job = toJobError(new ProviderError("no such model", 404), "detecting-questions");
    expect(job.code).toBe("PROVIDER_ERROR");
    expect(job.message).toMatch(/AI_MODEL/);
    expect(job.retryable).toBe(false);
  });

  it("calls a 503 temporary rather than fatal", () => {
    const job = toJobError(new ProviderError("overloaded", 503), "reading-answer-sheet");
    expect(job.message).toMatch(/overloaded/i);
    expect(job.retryable).toBe(true);
  });

  it("does not tell the teacher their paper is illegible when the network dropped", () => {
    // The regression this guards: a transport failure during a reading stage
    // used to be reported as "check that the question paper is legible".
    const job = toJobError(
      new ProviderNetworkError("Provider request timed out after 90s."),
      "reading-question-paper",
    );

    expect(job.code).toBe("PROVIDER_ERROR");
    expect(job.message).not.toMatch(/legible/i);
    expect(job.message).toMatch(/connection/i);
    expect(job.retryable).toBe(true);
  });

  it("classifies a raw transport error even when it is not a ProviderError", () => {
    for (const message of [
      "fetch failed",
      "socket hang up ECONNRESET",
      "getaddrinfo ENOTFOUND api.example.com",
      "The operation was aborted",
    ]) {
      const job = toJobError(new Error(message), "reading-answer-sheet");
      expect(job.code, message).toBe("PROVIDER_ERROR");
      expect(job.message, message).not.toMatch(/scan is clear/i);
    }
  });

  it("still reports a genuine extraction failure against the document", () => {
    const paper = toJobError(new Error("no lines found"), "detecting-questions");
    expect(paper.code).toBe("QUESTION_EXTRACTION_FAILED");
    expect(paper.message).toMatch(/legible/i);

    const sheet = toJobError(new Error("no lines found"), "detecting-answers");
    expect(sheet.code).toBe("ANSWER_EXTRACTION_FAILED");
    expect(sheet.message).toMatch(/scan is clear/i);
  });

  it("falls back to a generic message for anything unrecognised", () => {
    const job = toJobError(new Error("cannot read property x of undefined"), "mapping");
    expect(job.code).toBe("INTERNAL");
    expect(job.retryable).toBe(true);
  });

  it("never leaks the underlying detail to the client", () => {
    // Provider bodies and stack traces stay server-side; the client gets copy.
    const leaky = new ProviderError(
      "Gemini request failed (400): {\"error\":{\"message\":\"key AQ.SECRET rejected\"}}",
      400,
    );
    const job = toJobError(leaky, "reading-answer-sheet");
    expect(job.message).not.toMatch(/AQ\.SECRET/);
    expect(job.message).not.toMatch(/\{/);
  });

  it("handles a thrown non-Error value without crashing", () => {
    expect(() => toJobError("something odd", "mapping")).not.toThrow();
    expect(toJobError(null, "mapping").code).toBe("INTERNAL");
  });
});
