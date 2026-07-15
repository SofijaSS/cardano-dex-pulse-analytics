import { describe, expect, it } from "vitest";
import {
  classifySourceQuality,
  safeDivide,
  safePercentChange,
  sumAvailable,
  validateUsdAdaPair,
  variancePct,
} from "../lib/calculations";
import { formatMoney } from "../lib/format";
import { summarizeMinswapVersion } from "../lib/protocol-versions";
import { DEX_VERSION_REGISTRY } from "../config/dexes";
import { buildWeeklyReportModel } from "../lib/weekly-report";
import type { DexMetric } from "../lib/types";

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
