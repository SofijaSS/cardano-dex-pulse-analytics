import { describe, expect, it } from "vitest";
import { DEX_TOKEN_REGISTRY } from "../config/tokens";
import {
  calculateTokenChanges,
  normalizeDexHunterCandles,
  parseDexHunterOrderbook,
  sumDexHunterLiquidityAda,
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
  });
});

describe("DEX Hunter candle validation", () => {
  it("normalizes valid candles and rejects impossible or non-positive prices", () => {
    const result = normalizeDexHunterCandles({
      data: [
        { time: 2, open: "2", high: "3", low: "1", close: "2.5", volume: "40" },
        { time: 1, open: 2, high: 1.5, low: 1, close: 2.5, volume: 10 },
        { time: 3, open: 0, high: 3, low: 1, close: 2, volume: 10 },
      ],
    });

    expect(result).toEqual([
      { time: 2, open: 2, high: 3, low: 1, close: 2.5, volume: 40 },
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

describe("DEX Hunter market transformations", () => {
  it("sums only positive ADA-side pool liquidity", () => {
    expect(sumDexHunterLiquidityAda({ data: [
      { token_1_amount: "100" },
      { token_1_amount: 50 },
      { token_1_amount: 0 },
      { token_1_amount: "invalid" },
    ] })).toBe(150);
  });

  it("parses nested order arrays and protects the spread calculation", () => {
    const orderbook = parseDexHunterOrderbook({ data: [
      { side: "buy", price: 0.02, amount: 100 },
      { side: "buy", price: 0.019, amount: 50 },
      { side: "sell", price: 0.022, amount: 80 },
    ] });

    expect(orderbook?.bestBid).toBe(0.02);
    expect(orderbook?.bestAsk).toBe(0.022);
    expect(orderbook?.bids[1].cumulative).toBe(150);
    expect(orderbook?.spreadPct).toBeCloseTo(9.5238, 3);
    expect(parseDexHunterOrderbook({ data: [] })).toBeNull();
  });
});
