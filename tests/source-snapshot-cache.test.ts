import { describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  unstableCache: vi.fn((load: () => Promise<unknown>) => load),
}));

vi.mock("next/cache", () => ({
  revalidateTag: cacheMocks.revalidateTag,
  unstable_cache: cacheMocks.unstableCache,
}));

import {
  BENCHMARK_REFRESH_SECONDS,
  DEX_REFRESH_SECONDS,
  PRICE_REFRESH_SECONDS,
} from "../lib/source-config";
import {
  DASHBOARD_SOURCE_CACHE_TAG,
  revalidateDashboardSources,
  sourceRefreshSeconds,
} from "../lib/source-snapshot-cache";

describe("source snapshot refresh policy", () => {
  it("refreshes ADA price providers on the price cadence", () => {
    expect(sourceRefreshSeconds("coingecko-price")).toBe(PRICE_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("coinbase-price")).toBe(PRICE_REFRESH_SECONDS);
  });

  it("refreshes active DEX and TVL providers hourly by default", () => {
    expect(sourceRefreshSeconds("minswap-pool-reconciliation-v1")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("wingriders-native")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("wingriders-fees")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("poolflow-markets-v2")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("defillama-tvl")).toBe(DEX_REFRESH_SECONDS);
  });

  it("refreshes daily and benchmark providers on the slower cadence", () => {
    expect(sourceRefreshSeconds("defillama-volume")).toBe(BENCHMARK_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("muesliswap-native")).toBe(BENCHMARK_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("dano-native")).toBe(BENCHMARK_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("delta-native")).toBe(BENCHMARK_REFRESH_SECONDS);
  });

  it("keeps the last successful source snapshot during manual refresh", () => {
    revalidateDashboardSources();

    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      "dashboard-source-delta-native",
      "max",
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      "dashboard-source-defillama-volume",
      { expire: 0 },
    );
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalledWith(
      DASHBOARD_SOURCE_CACHE_TAG,
      expect.anything(),
    );
  });
});
