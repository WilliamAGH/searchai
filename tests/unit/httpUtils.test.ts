import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchJsonWithRetry,
  buildApiBase,
  resolveApiPath,
} from "../../src/lib/utils/httpUtils";

describe("httpUtils", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(async () => {
    // Ensure no pending timers or mocks leak between tests, avoiding unhandled rejections
    try {
      // Drain any pending timers from fake timers if active
      // @ts-ignore - runAllTimersAsync exists under fake timers
      if ((vi as any).runAllTimersAsync) {
        // @ts-ignore
        await (vi as any).runAllTimersAsync();
      }
      vi.clearAllTimers();
    } catch {}
    try {
      vi.useRealTimers();
    } catch {}
    // Allow any pending microtasks to settle before the worker tears down
    await Promise.resolve();
    vi.clearAllMocks();
  });

  it("builds and resolves api paths", () => {
    expect(buildApiBase("https://example.com/api")).toBe("https://example.com");
    expect(resolveApiPath("https://example.com", "/foo")).toBe(
      "https://example.com/foo",
    );
  });

  it("fetchJsonWithRetry returns JSON on first success", async () => {
    const mockJson = { ok: true };
    // @ts-expect-error - override global fetch for test
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => mockJson,
    }));

    const result = await fetchJsonWithRetry("https://example.com/data");
    expect(result).toEqual(mockJson);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetchJsonWithRetry retries on failure and eventually succeeds", async () => {
    vi.useFakeTimers();

    const mockJson = { value: 42 };
    const fetchMock = vi
      // @ts-expect-error - override global fetch for test
      .spyOn(global, "fetch")
      .mockImplementationOnce(async () => ({ ok: false, status: 500 }))
      .mockImplementationOnce(async () => ({ ok: false, status: 502 }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => mockJson,
      }));

    const p = fetchJsonWithRetry("https://example.com/data");

    // advance retry 1 (1000ms) and retry 2 (2000ms)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await p;
    expect(result).toEqual(mockJson);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("fetchJsonWithRetry throws last error after max retries", async () => {
    // Always fail; use a single retry to avoid scheduling timers in this environment
    // @ts-expect-error - override global fetch for test
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 });

    await expect(
      fetchJsonWithRetry("https://example.com/data", undefined, 1),
    ).rejects.toThrow("HTTP 503");
  });
});
