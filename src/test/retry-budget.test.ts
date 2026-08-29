import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/ai/provider";

describe("withRetry elapsed budget", () => {
  it("stops retrying once the budget is spent, so the caller can still report", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const slow = async () => {
      calls += 1;
      // Each attempt burns more than the whole budget.
      vi.advanceTimersByTime(200_000);
      throw new Error("Provider request timed out after 150s.");
    };
    const run = withRetry(slow, { attempts: 5, maxElapsedMs: 170_000 });
    const settled = expect(run).rejects.toThrow(/timed out/);
    await vi.runAllTimersAsync();
    await settled;
    // Without the budget this would have burned all five attempts, roughly
    // 1000s, long after the host had closed the response.
    expect(calls).toBe(1);
    vi.useRealTimers();
  });

  it("still uses every attempt when calls fail fast", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const run = withRetry(
      async () => {
        calls += 1;
        throw new Error("network blip");
      },
      { attempts: 4, baseDelayMs: 1, maxElapsedMs: 170_000 },
    );
    const settled = expect(run).rejects.toThrow(/network blip/);
    await vi.runAllTimersAsync();
    await settled;
    expect(calls).toBe(4);
    vi.useRealTimers();
  });
});
