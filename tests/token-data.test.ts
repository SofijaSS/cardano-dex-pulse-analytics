import { describe, expect, it } from "vitest";
import { DEX_VERSION_REGISTRY } from "../config/dexes";
import { DEX_TOKEN_REGISTRY } from "../config/tokens";
import { SOURCE_ENDPOINTS } from "../lib/source-config";
import {
  calculateTokenChanges,
  normalizeMinswapCandles,
  parseMinswapAssetMetrics,
  TOKEN_RANGE_CONFIG,
} from "../lib/token-data";
import type { TokenCandle } from "../lib/token-types";

function candleSeries(stepSeconds: number, count: number): TokenCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index * stepSeconds,
    open: 10 + index * 0.01,
    high: 10.1 + index * 0.01,
    low: 9.9 + index * 0.01,
    close: 10.01 + index * 0.01,
    volume: 100 + index,
  }));
}

describe("DEX token registry", () => {
  it("keeps the reporting order and unique Cardano policy asset IDs", () => {
    expect(DEX_TOKEN_REGISTRY.map((token) => token.dexName)).toEqual([
      "WingRiders",
      "Minswap",
      "SundaeSwap",
      "Splash",
      "VyFinance",
      "CSWAP",
    ]);
    expect(new Set(DEX_TOKEN_REGISTRY.map((token) => token.tokenId)).size).toBe(6);
    expect(DEX_TOKEN_REGISTRY.every((token) => /^[0-9a-f]+$/.test(token.tokenId))).toBe(true);
    expect(DEX_TOKEN_REGISTRY[0].logo).toBe("/dex-logos/wingriders-v2.png");
    expect(DEX_TOKEN_REGISTRY.slice(1).every((token) => token.logo.startsWith("https://icons.llamao.fi/"))).toBe(true);
    expect(DEX_VERSION_REGISTRY.find((version) => version.id === "wingriders-v2")?.logo)
      .toBe("/dex-logos/wingriders-v2.png");
  });

  it("supports every clickable timeframe as a real OHLCV range", () => {
    expect(Object.keys(TOKEN_RANGE_CONFIG)).toEqual([
      "15m",
      "1h",
      "4h",
      "24h",
      "7d",
      "30d",
      "90d",
      "1y",
    ]);
    expect(TOKEN_RANGE_CONFIG["15m"].interval).toBe("1m");
    expect(TOKEN_RANGE_CONFIG["1h"].interval).toBe("5m");
    expect(TOKEN_RANGE_CONFIG["4h"].interval).toBe("15m");
  });

  it("uses Minswap as the exclusive token-market endpoint", () => {
    expect(SOURCE_ENDPOINTS.minswapApi).toBe("https://api-mainnet-prod.minswap.org");
    expect("dexScreenerApi" in SOURCE_ENDPOINTS).toBe(false);
  });
});

describe("Minswap candle validation", () => {
  it("normalizes valid candles and rejects impossible or non-positive prices", () => {
    const result = normalizeMinswapCandles([
      { timestamp: 1_700_000_002_000, open: "2", high: "3", low: "1", close: "2.5", volume: "40" },
      { timestamp: 1_700_000_001_000, open: 2, high: 1.5, low: 1, close: 2.5, volume: 10 },
      { timestamp: 1_700_000_003_000, open: 0, high: 3, low: 1, close: 2, volume: 10 },
    ]);

    expect(result).toEqual([
      { time: 1_700_000_002, open: 2, high: 3, low: 1, close: 2.5, volume: 40 },
    ]);
  });

  it("does not calculate a change when candles do not cover the period", () => {
    const sevenDaysOnly = candleSeries(4 * 60 * 60, 43);
    expect(calculateTokenChanges(candleSeries(15 * 60, 97), sevenDaysOnly)["30d"]).toBeNull();
  });

  it("calculates changes from sufficiently covered verified periods", () => {
    const changes = calculateTokenChanges(
      candleSeries(15 * 60, 97),
      candleSeries(4 * 60 * 60, 181),
    );
    expect(changes["24h"]).toBeCloseTo(9.7, 4);
    expect(changes["30d"]).toBeCloseTo(18.1, 4);
  });
});

describe("public token market transformations", () => {
  it("maps Minswap ADA metrics without inventing absent fields", () => {
    expect(parseMinswapAssetMetrics({
      price: "0.0216",
      price_change_1h: 0.62,
      price_change_24h: -1.25,
      price_change_7d: 55.76,
      volume_24h: 825.78,
      liquidity: 396_130.5,
      market_cap: 2_066_428,
    })).toEqual({
      priceAda: 0.0216,
      change1h: 0.62,
      change24h: -1.25,
      change7d: 55.76,
      volume24hAda: 825.78,
      liquidityAda: 396_130.5,
      marketCapAda: 2_066_428,
    });
    expect(parseMinswapAssetMetrics({ price: 0 })).toBeNull();
  });
});
