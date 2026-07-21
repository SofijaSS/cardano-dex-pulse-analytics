import { describe, expect, it } from "vitest";
import {
  mergeMinswapMarketInsights,
  parseMinswapMarketInsights,
  summarizeMinswapSundaeSwap,
} from "../lib/minswap-market-insights";

const protocols = [
  "minswap-cpmm-v2",
  "sundae-stable-cpmm-v1",
  "sundae-cpmm-v3",
  "sundae-cpmm-v1",
];

function series(value: number) {
  return Array.from({ length: 35 }, () => value);
}

function payload() {
  return {
    code: 200,
    message: "OK",
    data: {
      timestamp: Array.from({ length: 35 }, (_, index) =>
        1_699_920_000 + index * 86_400,
      ),
      protocol: protocols,
      tvl: [series(5_000), series(100), series(1_000), series(200)],
      vol: [series(50), series(1), series(10), series(2)],
      fee: [series(5), series(0.1), series(1), series(0.2)],
      trade: [series(50), series(1), series(10), series(2)],
      awallet: [series(20), series(3), series(30), series(6)],
    },
  };
}

describe("Minswap Market Insights SundaeSwap adapter", () => {
  it("keeps V1 and V3 exact while including Stable only in the family total", () => {
    const metrics = summarizeMinswapSundaeSwap(
      parseMinswapMarketInsights(payload()),
    );

    expect(metrics.aggregate).toMatchObject({
      volume24hUsd: 13,
      volume7dUsd: 91,
      volume30dUsd: 390,
      previous7dUsd: 91,
      tvlUsd: 1_300,
      trades24h: 13,
      dau24h: null,
      fees24hUsd: 1.3,
      fees7dUsd: 9.1,
    });
    expect(metrics.v3).toMatchObject({
      volume24hUsd: 10,
      volume7dUsd: 70,
      volume30dUsd: 300,
      tvlUsd: 1_000,
      trades24h: 10,
      dau24h: 30,
    });
    expect(metrics.v1).toMatchObject({
      volume24hUsd: 2,
      volume7dUsd: 14,
      volume30dUsd: 60,
      tvlUsd: 200,
      trades24h: 2,
      dau24h: 6,
    });
  });

  it("fails closed when metric dimensions do not align with protocol IDs", () => {
    const invalid = payload();
    invalid.data.vol[0] = invalid.data.vol[0].slice(1);

    expect(() => parseMinswapMarketInsights(invalid)).toThrow(
      "matrix dimensions are inconsistent",
    );
  });

  it("fails closed when a required SundaeSwap contract series is missing", () => {
    const parsed = parseMinswapMarketInsights(payload());
    parsed.protocol[1] = "another-protocol";

    expect(() => summarizeMinswapSundaeSwap(parsed)).toThrow(
      "missing sundae-stable-cpmm-v1",
    );
  });

  it("excludes the active partial UTC day from every reporting period", () => {
    const activeDay = payload();
    const lastIndex = activeDay.data.timestamp.length - 1;
    for (const matrix of [activeDay.data.vol, activeDay.data.fee]) {
      for (const metricSeries of matrix) metricSeries[lastIndex] = 999_999;
    }
    const now = (activeDay.data.timestamp[lastIndex] + 3_600) * 1_000;
    const metrics = summarizeMinswapSundaeSwap(
      parseMinswapMarketInsights(activeDay),
      now,
    );

    expect(metrics.aggregate.volume24hUsd).toBe(13);
    expect(metrics.aggregate.volume7dUsd).toBe(91);
    expect(metrics.aggregate.volume30dUsd).toBe(390);
    expect(metrics.aggregate.fees24hUsd).toBe(1.3);
    expect(metrics.dataAt).toBe(
      new Date(activeDay.data.timestamp[lastIndex - 1] * 1_000).toISOString(),
    );
  });

  it("prefers the recent feed for overlapping timestamps", () => {
    const history = parseMinswapMarketInsights(payload());
    const recentPayload = payload();
    recentPayload.data.vol[2][34] = 123;
    const recent = parseMinswapMarketInsights(recentPayload);
    const metrics = summarizeMinswapSundaeSwap(
      mergeMinswapMarketInsights(history, recent),
    );

    expect(metrics.v3.volume24hUsd).toBe(123);
    expect(metrics.aggregate.volume24hUsd).toBe(126);
  });
});
