import { safeDivide, safePercentChange } from "@/lib/calculations";
import type { DashboardData, DexMetric } from "@/lib/types";

export function buildMockDashboardData(): DashboardData {
  const now = Date.now();
  const inputs = [
    ["minswap", "Minswap", "#00a86b", 640_000, 4_200_000, 18_000_000, 4_000_000, 18_500_000],
    ["sundaeswap", "SundaeSwap", "#ef6c47", 410_000, 3_100_000, 13_200_000, 2_900_000, 3_400_000],
    ["wingriders", "WingRiders", "#1b5cff", 90_000, 720_000, 3_100_000, 760_000, 2_600_000],
    ["splash", "Splash", "#02a9f7", 62_000, null, null, null, 3_500_000],
    ["vyfinance", "VyFinance", "#d9a600", 8_000, 54_000, null, 48_000, 520_000],
    ["muesliswap", "MuesliSwap", "#be7b43", 500, 4_200, 18_000, 5_100, 115_000],
  ] as const;
  const total24 = inputs.reduce((sum, row) => sum + (row[3] || 0), 0);

  const dexes: DexMetric[] = inputs.map((row, index) => ({
    id: row[0],
    name: row[1],
    rowKind: "protocol",
    tableRole: "primary",
    parentId: null,
    protocolVersion: null,
    color: row[2],
    logo: null,
    volume24hUsd: row[3],
    volume7dUsd: row[4],
    volume30dUsd: row[5],
    previous7dUsd: row[6],
    weekChangePct: safePercentChange(row[4], row[6]),
    tvlUsd: row[7],
    volumeToTvl: safeDivide(row[3], row[7]),
    marketShare24hPct: (row[3] / total24) * 100,
    rank7d: row[4] == null ? null : index + 1,
    trades24h: null,
    users24h: null,
    dau24h: null,
    fees24hUsd: row[3] * 0.003,
    fees7dUsd: row[4] == null ? null : row[4] * 0.003,
    marketCapUsd: null,
    marketCapToTvl: null,
    poolCount: null,
    nativeVolume24hUsd: row[3],
    defillamaVolume24hUsd: row[3] * 0.92,
    defillamaVolume7dUsd: row[4],
    defillamaVolume30dUsd: row[5],
    defillamaPrevious7dUsd: row[6],
    variance24hPct: 8.7,
    quality: "aligned",
    sourceLabel: "Mock development fixture",
    sourceUrl: null,
    periodNote: "Synthetic values for UI development only.",
    lastDataAt: new Date(now).toISOString(),
  }));

  const benchmarkSeries = Array.from({ length: 120 }, (_, index) => {
    const timestamp = Math.floor((now - (119 - index) * 86_400_000) / 1000);
    const byDex = Object.fromEntries(
      dexes.map((dex, dexIndex) => [
        dex.id,
        Math.max(
          0,
          (dex.volume24hUsd || 0) *
            (0.75 + Math.sin(index / (5 + dexIndex)) * 0.18),
        ),
      ]),
    );
    return {
      timestamp,
      totalUsd: Object.values(byDex).reduce((sum, value) => sum + value, 0),
      byDex,
    };
  });

  return {
    schemaVersion: "1.0",
    mode: "mock",
    generatedAt: new Date(now).toISOString(),
    price: {
      usd: 0.5,
      timestamp: new Date(now).toISOString(),
      source: "Mock development fixture",
      endpoint: "mock://ada-usd",
    },
    aggregates: {
      observed24hUsd: total24,
      observed7dUsd: 8_078_200,
      observed30dUsd: 34_318_000,
      observedTvlUsd: 28_635_000,
      comparableWeekChangePct: 3.2,
      comparableMonthChangePct: null,
      activeDexes: 6,
      coverage24h: 6,
      coverage7d: 5,
      coverage30d: 4,
      trackedDexes: 6,
      benchmark24hUsd: total24 * 0.92,
      benchmark7dUsd: 7_800_000,
      benchmark30dUsd: 33_000_000,
      benchmarkTvlUsd: 29_000_000,
      benchmarkWeekChangePct: 2.8,
      benchmarkMonthChangePct: -1.1,
    },
    dexes,
    benchmarkSeries,
    sources: [
      {
        id: "mock",
        label: "Mock development fixture",
        endpoint: "mock://dashboard",
        health: "healthy",
        fetchedAt: new Date(now).toISOString(),
        dataAt: new Date(now).toISOString(),
        expectedUpdateMinutes: 60,
        message: "Synthetic development data is active.",
      },
    ],
    warnings: [
      "MOCK DATA MODE IS ACTIVE. Every value on this screen is synthetic and must not be used for reporting.",
    ],
  };
}
