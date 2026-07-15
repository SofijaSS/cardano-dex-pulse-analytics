export interface MinswapPoolMetricInput {
  type: string;
  volume_24h?: number | null;
  volume_7d?: number | null;
  trading_fee_24h?: number | null;
  trading_fee_7d?: number | null;
  liquidity_currency?: number | null;
}

export interface MinswapVersionSummary {
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  fees24hUsd: number | null;
  fees7dUsd: number | null;
  tvlUsd: number | null;
  poolCount: number;
}

function sumFinite(
  rows: MinswapPoolMetricInput[],
  field: keyof Omit<MinswapPoolMetricInput, "type">,
) {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function summarizeMinswapVersion(
  dayRows: MinswapPoolMetricInput[],
  weekRows: MinswapPoolMetricInput[],
  nativeType: string,
): MinswapVersionSummary | null {
  const day = dayRows.filter((row) => row.type === nativeType);
  const week = weekRows.filter((row) => row.type === nativeType);
  if (!day.length && !week.length) return null;

  return {
    volume24hUsd: sumFinite(day, "volume_24h"),
    volume7dUsd: sumFinite(week, "volume_7d"),
    fees24hUsd: sumFinite(day, "trading_fee_24h"),
    fees7dUsd: sumFinite(week, "trading_fee_7d"),
    tvlUsd: sumFinite(day, "liquidity_currency"),
    poolCount: day.length,
  };
}
