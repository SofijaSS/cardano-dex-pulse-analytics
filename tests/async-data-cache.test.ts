import { describe, expect, it, vi } from "vitest";
import { AsyncDataCache } from "../lib/async-data-cache";

describe("AsyncDataCache", () => {
  it("reuses fresh values and supports a forced refresh", async () => {
    const cache = new AsyncDataCache();
    let value = 1;
    const load = vi.fn(async () => value);

    await expect(cache.get("key", load, { ttlMs: 60_000, staleForMs: 60_000 }))
      .resolves.toEqual({ status: "miss", value: 1 });
    value = 2;
    await expect(cache.get("key", load, { ttlMs: 60_000, staleForMs: 60_000 }))
      .resolves.toEqual({ status: "hit", value: 1 });
    await expect(cache.get("key", load, { force: true, ttlMs: 60_000, staleForMs: 60_000 }))
      .resolves.toEqual({ status: "refresh", value: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous requests", async () => {
    const cache = new AsyncDataCache();
    let resolveLoad: (value: number) => void = () => undefined;
    const load = vi.fn(() => new Promise<number>((resolve) => {
      resolveLoad = resolve;
    }));

    const first = cache.get("shared", load, { ttlMs: 60_000, staleForMs: 60_000 });
    const second = cache.get("shared", load, { ttlMs: 60_000, staleForMs: 60_000 });
    await Promise.resolve();
    resolveLoad(42);

    await expect(first).resolves.toEqual({ status: "miss", value: 42 });
    await expect(second).resolves.toEqual({ status: "shared", value: 42 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns a recent stale value when refresh fails", async () => {
    const cache = new AsyncDataCache();
    await cache.get("stale", async () => 7, { ttlMs: 0, staleForMs: 60_000 });

    await expect(cache.get(
      "stale",
      async () => { throw new Error("provider down"); },
      { ttlMs: 0, staleForMs: 60_000 },
    )).resolves.toEqual({ status: "stale", value: 7 });
  });
});
