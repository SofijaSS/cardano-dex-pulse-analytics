import { describe, expect, it } from "vitest";
import {
  classifySourceQuality,
  safeDivide,
  safePercentageShares,
  safePercentChange,
  sumAvailable,
  validateUsdAdaPair,
  variancePct,
} from "../lib/calculations";
import { formatDateTime, formatMoney } from "../lib/format";
import { summarizeMinswapVersion } from "../lib/protocol-versions";
import { DEX_REGISTRY, DEX_VERSION_REGISTRY } from "../config/dexes";
import { buildDexRows, parseWingRidersPayload } from "../lib/dashboard-data";
import { buildWeeklyReportModel } from "../lib/weekly-report";
import type { DexMetric, NativeDexSnapshot } from "../lib/types";

describe("safePercentChange", () => {
  it("uses the required current-versus-previous formula", () => {
    expect(safePercentChange(125, 100)).toBe(25);
    expect(safePercentChange(75, 100)).toBe(-25);
  });

  it("returns null when the previous period is zero or unavailable", () => {
    expect(safePercentChange(100, 0)).toBeNull();
    expect(safePercentChange(100, null)).toBeNull();
    expect(safePercentChange(null, 100)).toBeNull();
  });
});

describe("safeDivide", () => {
  it("protects volume-to-TVL calculations from zero and missing TVL", () => {
    expect(safeDivide(50, 100)).toBe(0.5);
    expect(safeDivide(50, 0)).toBeNull();
    expect(safeDivide(50, null)).toBeNull();
  });
});

describe("safePercentageShares", () => {
  it("calculates percentage shares only from positive available values", () => {
    const shares = safePercentageShares([60, 30, 10, null, 0]);

    expect(shares).toEqual([60, 30, 10, null, null]);
    expect(
      shares.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    ).toBeCloseTo(100);
  });

  it("returns unavailable shares when the observed total is zero", () => {
    expect(safePercentageShares([0, null, undefined])).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe("source reconciliation", () => {
  it("flags aligned and materially different source values", () => {
    expect(variancePct(110, 100)).toBeCloseTo(10);
    expect(classifySourceQuality(110, 100)).toBe("aligned");
    expect(classifySourceQuality(150, 100)).toBe("material-variance");
  });

  it("does not imply a comparison when one source is missing", () => {
    expect(classifySourceQuality(100, null)).toBe("native-only");
    expect(classifySourceQuality(null, 100)).toBe("benchmark-only");
    expect(classifySourceQuality(null, null)).toBe("unavailable");
  });
});

describe("currency normalization", () => {
  it("accepts a Minswap USD/ADA pair that implies the reference ADA price", () => {
    const result = validateUsdAdaPair(351_083, 2_147_014, 0.1645);
    expect(result.status).toBe("aligned");
    expect(result.impliedAdaUsd).toBeCloseTo(0.1635, 3);
  });

  it("rejects a mislabeled currency pair", () => {
    expect(validateUsdAdaPair(2_147_014, 2_147_014, 0.1645).status).toBe(
      "mismatch",
    );
  });
});

describe("sumAvailable", () => {
  it("keeps missing cohorts distinct from real zero totals", () => {
    expect(sumAvailable([null, undefined])).toBeNull();
    expect(sumAvailable([0, null])).toBe(0);
    expect(sumAvailable([10, null, 5])).toBe(15);
  });
});

describe("report formatting", () => {
  it("places a negative sign before the USD symbol", () => {
    expect(formatMoney(-1_250, "USD", null, false)).toBe("-$1,250");
  });

  it("uses Central European time with daylight-saving awareness", () => {
    expect(formatDateTime("2026-01-15T12:00:00Z")).toContain("13:00 CET");
    expect(formatDateTime("2026-07-15T12:00:00Z")).toContain("14:00 CEST");
  });
});

describe("Minswap protocol-version transformation", () => {
  it("keeps V1 and V2 metrics separate across independently ranked periods", () => {
    const dayRows = [
      { type: "MinswapV2", volume_24h: 80, trading_fee_24h: 0.8, liquidity_currency: 400 },
      { type: "MinswapV2", volume_24h: 20, trading_fee_24h: 0.2, liquidity_currency: 100 },
      { type: "Minswap", volume_24h: 10, trading_fee_24h: 0.1, liquidity_currency: 50 },
    ];
    const weekRows = [
      { type: "MinswapV2", volume_7d: 700, trading_fee_7d: 7 },
      { type: "Minswap", volume_7d: 70, trading_fee_7d: 0.7 },
    ];

    expect(summarizeMinswapVersion(dayRows, weekRows, "MinswapV2")).toEqual({
      volume24hUsd: 100,
      volume7dUsd: 700,
      fees24hUsd: 1,
      fees7dUsd: 7,
      tvlUsd: 500,
      poolCount: 2,
    });
    expect(summarizeMinswapVersion(dayRows, weekRows, "Unknown")).toBeNull();
  });
});

describe("version-aware table configuration", () => {
  it("publishes only the requested canonical DEX version names", () => {
    const visibleNames = DEX_VERSION_REGISTRY
      .filter((version) => version.showInTable)
      .map((version) => version.name);

    expect(visibleNames).toEqual([
      "Minswap V2",
      "Minswap",
      "WingRiders V2",
      "WingRiders",
      "SundaeSwap V3",
      "SundaeSwap V1",
    ]);
    expect(visibleNames).not.toContain("Minswap (Stable)");
    expect(
      DEX_VERSION_REGISTRY.find((version) => version.id === "wingriders-v2")
        ?.useParentMetrics,
    ).toBe(true);
    expect(
      DEX_VERSION_REGISTRY.find((version) => version.id === "wingriders-v1")
        ?.useParentMetrics,
    ).not.toBe(true);
    expect(
      DEX_VERSION_REGISTRY.find((version) => version.id === "sundaeswap-v3")
        ?.useParentMetrics,
    ).toBe(true);
    expect(
      DEX_VERSION_REGISTRY.find((version) => version.id === "sundaeswap-v1")
        ?.useParentMetrics,
    ).not.toBe(true);
  });

  it("keeps the extended Cardano DEX registry visible during source outages", () => {
    expect(DEX_REGISTRY.map((dex) => dex.id)).toEqual(
      expect.arrayContaining([
        "snek-fun",
        "cswap",
        "teddyswap",
        "astarter-amm",
        "genius-yield",
        "adax-pro",
        "meowswapfi",
      ]),
    );
  });

  it("maps verified WingRiders protocol metrics to V2 without populating V1", () => {
    const nativeWingRiders: NativeDexSnapshot = {
      id: "wingriders",
      volume24hUsd: 100,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: 400,
      fees24hUsd: 1,
      sourceLabel: "WingRiders official API",
      sourceUrl: "https://api.mainnet.wingriders.com/v1/defillama",
      periodNote: "Current WingRiders protocol metric.",
      dataAt: "2026-07-15T10:00:00.000Z",
    };
    const { rows } = buildDexRows({
      overview: {
        total24h: 105,
        total7d: 735,
        total30d: 3_150,
        total14dto7d: 680,
        total60dto30d: 3_000,
        protocols: [
          {
            name: "WingRiders",
            total24h: 98,
            total7d: 700,
            total30d: 3_000,
            total14dto7d: 650,
            total60dto30d: 2_900,
          },
          { name: "Volume Only DEX", total24h: 7 },
        ],
        totalDataChart: [[1_752_571_200, 105]],
        totalDataChartBreakdown: [],
      },
      protocols: [],
      nativeSnapshots: new Map([["wingriders", nativeWingRiders]]),
      versionSnapshots: new Map(),
    });

    const v2 = rows.find((row) => row.id === "wingriders-v2");
    const v1 = rows.find((row) => row.id === "wingriders-v1");
    expect(v2).toMatchObject({
      volume24hUsd: 100,
      volume7dUsd: 700,
      volume30dUsd: 3_000,
      previous7dUsd: 650,
      defillamaVolume24hUsd: 98,
      fees24hUsd: 1,
      quality: "aligned",
    });
    expect(v1?.volume24hUsd).toBeNull();
    expect(v1?.volume7dUsd).toBeNull();
    expect(rows.find((row) => row.id === "volume-only-dex")).toMatchObject({
      tableRole: "primary",
      defillamaVolume24hUsd: 7,
    });
  });

  it("accepts numeric and string WingRiders metrics without coercing missing values", () => {
    expect(parseWingRidersPayload({ dailyVolume: 123.5, dailyFees: "4.25" })).toEqual({
      dailyVolume: 123.5,
      dailyFees: 4.25,
    });
    expect(() => parseWingRidersPayload({ dailyVolume: null, dailyFees: "4.25" })).toThrow();
  });

  it("keeps WingRiders history on V2 when same-lineage daily snapshots differ", () => {
    const nativeWingRiders: NativeDexSnapshot = {
      id: "wingriders",
      volume24hUsd: 100,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: 400,
      sourceLabel: "WingRiders official API",
      sourceUrl: "https://api.mainnet.wingriders.com/v1/defillama",
      periodNote: "Current WingRiders protocol metric.",
      dataAt: "2026-07-15T10:00:00.000Z",
    };
    const { rows } = buildDexRows({
      overview: {
        total24h: 300,
        total7d: 2_100,
        total30d: 9_000,
        total14dto7d: 1_800,
        total60dto30d: 8_000,
        protocols: [{
          name: "WingRiders",
          total24h: 300,
          total7d: 2_100,
          total30d: 9_000,
          total14dto7d: 1_800,
          total60dto30d: 8_000,
        }],
        totalDataChart: [[1_752_571_200, 300]],
        totalDataChartBreakdown: [],
      },
      protocols: [],
      nativeSnapshots: new Map([["wingriders", nativeWingRiders]]),
      versionSnapshots: new Map(),
    });

    expect(rows.find((row) => row.id === "wingriders-v2")).toMatchObject({
      volume24hUsd: 100,
      volume7dUsd: 2_100,
      volume30dUsd: 9_000,
      previous7dUsd: 1_800,
      quality: "material-variance",
    });
    expect(rows.find((row) => row.id === "wingriders-v1")?.volume7dUsd).toBeNull();
  });

  it("maps verified aggregate SundaeSwap metrics to V3 without populating V1", () => {
    const nativeSundaeSwap: NativeDexSnapshot = {
      id: "sundaeswap",
      volume24hUsd: 200,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: null,
      poolCount: 42,
      sourceLabel: "SundaeSwap official GraphQL",
      sourceUrl: "https://api.sundae.fi/graphql",
      periodNote: "Current aggregate SundaeSwap protocol metric.",
      dataAt: "2026-07-15T10:00:00.000Z",
    };
    const { rows } = buildDexRows({
      overview: {
        total24h: 198,
        total7d: 1_400,
        total30d: 6_000,
        total14dto7d: 1_300,
        total60dto30d: 5_500,
        protocols: [
          {
            name: "SundaeSwap",
            total24h: 198,
            total7d: 1_400,
            total30d: 6_000,
            total14dto7d: 1_300,
            total60dto30d: 5_500,
          },
        ],
        totalDataChart: [[1_752_571_200, 198]],
        totalDataChartBreakdown: [],
      },
      protocols: [
        {
          name: "SundaeSwap V3",
          category: "Dexs",
          chains: ["Cardano"],
          tvl: 800,
          chainTvls: { Cardano: 800 },
          logo: null,
        },
      ],
      nativeSnapshots: new Map([["sundaeswap", nativeSundaeSwap]]),
      versionSnapshots: new Map(),
    });

    const v3 = rows.find((row) => row.id === "sundaeswap-v3");
    const v1 = rows.find((row) => row.id === "sundaeswap-v1");
    expect(v3).toMatchObject({
      volume24hUsd: 200,
      volume7dUsd: 1_400,
      volume30dUsd: 6_000,
      previous7dUsd: 1_300,
      tvlUsd: 800,
      poolCount: 42,
      defillamaVolume24hUsd: 198,
      quality: "aligned",
    });
    expect(v3?.sourceLabel).toContain("primary V3 mapping");
    expect(v1?.volume24hUsd).toBeNull();
    expect(v1?.volume7dUsd).toBeNull();
  });
});

describe("interactive weekly report", () => {
  const weeklyRows = [
    { id: "minswap", name: "Minswap", volume7dUsd: 700, previous7dUsd: 600 },
    { id: "sundaeswap", name: "SundaeSwap", volume7dUsd: 500, previous7dUsd: 550 },
    { id: "wingriders", name: "WingRiders", volume7dUsd: 300, previous7dUsd: 250 },
    { id: "other", name: "Other", volume7dUsd: 100, previous7dUsd: 80 },
  ] as DexMetric[];

  it("selects any top-three DEX and calculates its comparable share", () => {
    const report = buildWeeklyReportModel(weeklyRows, "sundaeswap");
    expect(report.topThree.map((dex) => dex.id)).toEqual([
      "minswap",
      "sundaeswap",
      "wingriders",
    ]);
    expect(report.selectedDex?.id).toBe("sundaeswap");
    expect(report.rank).toBe(2);
    expect(report.share7d).toBeCloseTo((500 / 1_600) * 100);
    expect(report.difference).toBe(-50);
  });

  it("falls back to WingRiders, then the leader, when selection is unavailable", () => {
    expect(buildWeeklyReportModel(weeklyRows, "missing").selectedDex?.id).toBe(
      "wingriders",
    );
    expect(
      buildWeeklyReportModel(weeklyRows.filter((dex) => dex.id !== "wingriders"), "missing")
        .selectedDex?.id,
    ).toBe("minswap");
  });
});
