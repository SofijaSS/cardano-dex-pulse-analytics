import { describe, expect, it } from "vitest";
import {
  BENCHMARK_REFRESH_SECONDS,
  DEX_REFRESH_SECONDS,
  PRICE_REFRESH_SECONDS,
} from "../lib/source-config";
import { sourceRefreshSeconds } from "../lib/source-snapshot-cache";

describe("source snapshot refresh policy", () => {
  it("refreshes ADA price providers on the price cadence", () => {
    expect(sourceRefreshSeconds("coingecko-price")).toBe(PRICE_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("coinbase-price")).toBe(PRICE_REFRESH_SECONDS);
  });

  it("refreshes active DEX and TVL providers hourly by default", () => {
    expect(sourceRefreshSeconds("minswap-native-v2")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("wingriders-native")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("wingriders-fees")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("poolflow-markets-v2")).toBe(DEX_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("defillama-tvl")).toBe(DEX_REFRESH_SECONDS);
  });

  it("refreshes daily and benchmark providers on the slower cadence", () => {
    expect(sourceRefreshSeconds("defillama-volume")).toBe(BENCHMARK_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("muesliswap-native")).toBe(BENCHMARK_REFRESH_SECONDS);
    expect(sourceRefreshSeconds("dano-native")).toBe(BENCHMARK_REFRESH_SECONDS);
  });
});
