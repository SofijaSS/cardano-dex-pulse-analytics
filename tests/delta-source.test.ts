import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deltaDailyVolumeUrl,
  loadDeltaDailyVolume,
} from "../lib/delta-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeltaDeFi daily volume source", () => {
  it("builds the expected timestamped endpoint without dropping existing parameters", () => {
    expect(
      deltaDailyVolumeUrl(
        "https://metrics.example/daily?network=mainnet",
        Date.parse("2026-07-28T00:00:00.000Z"),
      ),
    ).toBe(
      "https://metrics.example/daily?network=mainnet&timestamp=1785196800",
    );
  });

  it("accepts the documented non-negative USD volume payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ volume_usd: 123.45 })),
    );

    await expect(
      loadDeltaDailyVolume(
        "https://metrics.example/daily",
        Date.parse("2026-07-28T00:00:00.000Z"),
        { attempts: 1, timeoutMs: 50 },
      ),
    ).resolves.toEqual({ volume_usd: 123.45 });
  });

  it("completes three consecutive failed refresh attempts without AbortError", async () => {
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

    const errors: Error[] = [];
    for (let refresh = 0; refresh < 3; refresh += 1) {
      try {
        await loadDeltaDailyVolume(
          "https://metrics.example/daily",
          Date.parse("2026-07-28T00:00:00.000Z"),
          { attempts: 1, timeoutMs: 5 },
        );
      } catch (error) {
        errors.push(error as Error);
      }
    }

    expect(errors).toHaveLength(3);
    expect(errors.every((error) => error.name === "SourceTimeoutError")).toBe(true);
    expect(errors.some((error) => error.name === "AbortError")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
