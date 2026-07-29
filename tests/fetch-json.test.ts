import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchJsonWithRetry,
  SourceTimeoutError,
} from "../lib/fetch-json";

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

  it("reports a source timeout instead of leaking AbortError", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("This operation was aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithRetry(
        "https://example.invalid/slow",
        {},
        { attempts: 1, timeoutMs: 5 },
      ),
    ).rejects.toEqual(new SourceTimeoutError(5));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
