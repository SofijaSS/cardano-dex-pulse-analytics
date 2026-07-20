import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry } from "../lib/fetch-json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJsonWithRetry", () => {
  it("does not retry a non-retryable client error", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJsonWithRetry(
      "https://example.invalid/missing",
      {},
      { attempts: 3, timeoutMs: 100 },
    )).rejects.toThrow("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient server error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJsonWithRetry(
      "https://example.invalid/transient",
      {},
      { attempts: 2, timeoutMs: 100 },
    )).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
