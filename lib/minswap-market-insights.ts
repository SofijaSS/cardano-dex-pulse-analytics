import { z } from "zod";

const metricSeriesSchema = z.array(z.number().finite().nonnegative());

const responseSchema = z.object({
  code: z.literal(200),
  data: z.object({
    timestamp: z.array(z.number().int().positive()).min(1),
    protocol: z.array(z.string().min(1)).min(1),
    tvl: z.array(metricSeriesSchema),
    vol: z.array(metricSeriesSchema),
    fee: z.array(metricSeriesSchema),
    trade: z.array(metricSeriesSchema),
    awallet: z.array(metricSeriesSchema),
  }),
});

const SUNDAE_PROTOCOLS = {
  stable: "sundae-stable-cpmm-v1",
  v1: "sundae-cpmm-v1",
  v3: "sundae-cpmm-v3",
} as const;
const MINSWAP_PROTOCOLS = {
  stable: "minswap-stable-cpmm-v1",
  v1: "minswap-cpmm-v1",
  v2: "minswap-cpmm-v2",
} as const;
const REQUIRED_MERGED_PROTOCOLS = [
  MINSWAP_PROTOCOLS.stable,
  MINSWAP_PROTOCOLS.v2,
  MINSWAP_PROTOCOLS.v1,
  SUNDAE_PROTOCOLS.stable,
  SUNDAE_PROTOCOLS.v3,
  SUNDAE_PROTOCOLS.v1,
] as const;
const METRIC_KEYS = ["tvl", "vol", "fee", "trade", "awallet"] as const;

type MarketData = z.infer<typeof responseSchema>["data"];

export interface MinswapMarketPeriod {
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  volume30dUsd: number | null;
  previous7dUsd: number | null;
  tvlUsd: number | null;
  trades24h: number | null;
  dau24h: number | null;
  fees24hUsd: number | null;
  fees7dUsd: number | null;
}

export interface MinswapSundaeMetrics {
  aggregate: MinswapMarketPeriod;
  v1: MinswapMarketPeriod;
  v3: MinswapMarketPeriod;
  dataAt: string;
}

export interface MinswapDeploymentMetrics {
  aggregate: MinswapMarketPeriod;
  v1: MinswapMarketPeriod;
  v2: MinswapMarketPeriod;
  dataAt: string;
}

export interface MinswapCswapMetrics {
  aggregate: MinswapMarketPeriod;
  protocolIds: string[];
  dataAt: string;
}

function cswapV1ProtocolIds(data: MarketData) {
  return data.protocol
    .filter((protocolId) => {
      const normalized = protocolId.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        normalized === "cswap" ||
        (normalized.startsWith("cswap") && normalized.endsWith("v1"))
      );
    })
    .sort();
}

function validateShape(data: MarketData) {
  const bucketCount = data.timestamp.length;
  const protocolCount = data.protocol.length;
  const matrices = [data.tvl, data.vol, data.fee, data.trade, data.awallet];

  if (new Set(data.protocol).size !== protocolCount) {
    throw new Error("Minswap Market Insights returned duplicate protocol IDs.");
  }
  if (data.timestamp.some((value, index) => index > 0 && value <= data.timestamp[index - 1])) {
    throw new Error("Minswap Market Insights timestamps are not strictly increasing.");
  }
  if (
    matrices.some(
      (matrix) =>
        matrix.length !== protocolCount ||
        matrix.some((series) => series.length !== bucketCount),
    )
  ) {
    throw new Error("Minswap Market Insights matrix dimensions are inconsistent.");
  }
}

export function parseMinswapMarketInsights(payload: unknown): MarketData {
  const parsed = responseSchema.parse(payload).data;
  validateShape(parsed);
  return parsed;
}

export function mergeMinswapMarketInsights(
  history: MarketData,
  recent: MarketData,
): MarketData {
  const historyCswap = cswapV1ProtocolIds(history);
  const recentCswap = cswapV1ProtocolIds(recent);
  const matchingCswap =
    historyCswap.length > 0 &&
    historyCswap.length === recentCswap.length &&
    historyCswap.every((protocolId, index) => protocolId === recentCswap[index])
      ? historyCswap
      : [];
  const protocol = [...REQUIRED_MERGED_PROTOCOLS, ...matchingCswap];
  const timestamp = [...new Set([...history.timestamp, ...recent.timestamp])].sort(
    (left, right) => left - right,
  );
  const merged = {
    timestamp,
    protocol,
    tvl: [] as number[][],
    vol: [] as number[][],
    fee: [] as number[][],
    trade: [] as number[][],
    awallet: [] as number[][],
  };

  for (const protocolId of protocol) {
    const historyIndex = history.protocol.indexOf(protocolId);
    const recentIndex = recent.protocol.indexOf(protocolId);
    if (historyIndex < 0 || recentIndex < 0) {
      throw new Error(`Minswap Market Insights is missing ${protocolId}.`);
    }

    for (const metric of METRIC_KEYS) {
      const values = new Map<number, number>();
      history.timestamp.forEach((value, index) => {
        values.set(value, history[metric][historyIndex][index]);
      });
      recent.timestamp.forEach((value, index) => {
        values.set(value, recent[metric][recentIndex][index]);
      });
      merged[metric].push(
        timestamp.map((value) => {
          const metricValue = values.get(value);
          if (metricValue == null) {
            throw new Error("Minswap Market Insights merge produced a missing bucket.");
          }
          return metricValue;
        }),
      );
    }
  }

  validateShape(merged);
  return merged;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function combineSeries(matrix: number[][], indexes: number[]) {
  return matrix[0].map((_, bucketIndex) =>
    sum(indexes.map((index) => matrix[index][bucketIndex])),
  );
}

function completeBucketCount(data: MarketData, now: number) {
  const currentUtcDayStart = Math.floor(now / 86_400_000) * 86_400;
  const latestCompleteIndex = data.timestamp.findLastIndex(
    (timestamp) => timestamp < currentUtcDayStart,
  );
  if (latestCompleteIndex < 0) {
    throw new Error("Minswap Market Insights has no complete UTC daily bucket.");
  }
  return latestCompleteIndex + 1;
}

export function latestCompleteMinswapMarketTimestamp(
  data: MarketData,
  now = Date.now(),
) {
  return data.timestamp[completeBucketCount(data, now) - 1] + 86_400;
}

function summarize(
  data: MarketData,
  protocolIds: string[],
  bucketCount: number,
): MinswapMarketPeriod {
  const indexes = protocolIds.map((protocolId) => {
    const index = data.protocol.indexOf(protocolId);
    if (index < 0) {
      throw new Error(`Minswap Market Insights is missing ${protocolId}.`);
    }
    return index;
  });
  const volume = combineSeries(data.vol, indexes).slice(0, bucketCount);
  const fees = combineSeries(data.fee, indexes).slice(0, bucketCount);
  const trades = combineSeries(data.trade, indexes).slice(0, bucketCount);
  const tvl = combineSeries(data.tvl, indexes).slice(0, bucketCount);
  const activeWallets = combineSeries(data.awallet, indexes).slice(0, bucketCount);

  return {
    volume24hUsd: volume.at(-1) ?? null,
    volume7dUsd: volume.length >= 7 ? sum(volume.slice(-7)) : null,
    volume30dUsd: volume.length >= 30 ? sum(volume.slice(-30)) : null,
    previous7dUsd:
      volume.length >= 14 ? sum(volume.slice(-14, -7)) : null,
    tvlUsd: tvl.at(-1) ?? null,
    trades24h: trades.at(-1) ?? null,
    dau24h: indexes.length === 1 ? activeWallets.at(-1) ?? null : null,
    fees24hUsd: fees.at(-1) ?? null,
    fees7dUsd: fees.length >= 7 ? sum(fees.slice(-7)) : null,
  };
}

export function summarizeMinswapSundaeSwap(
  data: MarketData,
  now = Date.now(),
): MinswapSundaeMetrics {
  const bucketCount = completeBucketCount(data, now);
  return {
    aggregate: summarize(data, [
      SUNDAE_PROTOCOLS.stable,
      SUNDAE_PROTOCOLS.v3,
      SUNDAE_PROTOCOLS.v1,
    ], bucketCount),
    v1: summarize(data, [SUNDAE_PROTOCOLS.v1], bucketCount),
    v3: summarize(data, [SUNDAE_PROTOCOLS.v3], bucketCount),
    dataAt: new Date(
      (data.timestamp[bucketCount - 1] + 86_400) * 1000,
    ).toISOString(),
  };
}

export function summarizeMinswapDeployments(
  data: MarketData,
  now = Date.now(),
): MinswapDeploymentMetrics {
  const bucketCount = completeBucketCount(data, now);
  return {
    aggregate: summarize(data, [
      MINSWAP_PROTOCOLS.stable,
      MINSWAP_PROTOCOLS.v2,
      MINSWAP_PROTOCOLS.v1,
    ], bucketCount),
    v1: summarize(data, [MINSWAP_PROTOCOLS.v1], bucketCount),
    v2: summarize(data, [MINSWAP_PROTOCOLS.v2], bucketCount),
    dataAt: new Date(
      (data.timestamp[bucketCount - 1] + 86_400) * 1000,
    ).toISOString(),
  };
}

export function summarizeMinswapCswap(
  data: MarketData,
  now = Date.now(),
): MinswapCswapMetrics | null {
  const protocolIds = cswapV1ProtocolIds(data);
  if (protocolIds.length === 0) return null;

  const bucketCount = completeBucketCount(data, now);
  return {
    aggregate: summarize(data, protocolIds, bucketCount),
    protocolIds,
    dataAt: new Date(
      (data.timestamp[bucketCount - 1] + 86_400) * 1000,
    ).toISOString(),
  };
}
