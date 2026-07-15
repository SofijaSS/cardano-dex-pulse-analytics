import type { DexTokenConfig } from "@/config/tokens";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";
import type {
  TokenAnalyticsData,
  TokenCandle,
  TokenChartRange,
  TokenTimeframe,
} from "@/lib/token-types";

const MINSWAP_API_URL = SOURCE_ENDPOINTS.minswapApi.replace(/\/$/, "");

export const TOKEN_RANGE_CONFIG: Record<
  TokenChartRange,
  { seconds: number; interval: string; limit: number }
> = {
  "15m": { seconds: 15 * 60, interval: "1m", limit: 500 },
  "1h": { seconds: 60 * 60, interval: "5m", limit: 500 },
  "4h": { seconds: 4 * 60 * 60, interval: "15m", limit: 500 },
  "24h": { seconds: 86_400, interval: "15m", limit: 500 },
  "7d": { seconds: 7 * 86_400, interval: "1h", limit: 500 },
  "30d": { seconds: 30 * 86_400, interval: "4h", limit: 500 },
  "90d": { seconds: 90 * 86_400, interval: "1d", limit: 500 },
  "1y": { seconds: 365 * 86_400, interval: "1d", limit: 500 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

async function fetchMinswapCandles(
  tokenId: string,
  range: TokenChartRange,
  nowMilliseconds: number,
) {
  const config = TOKEN_RANGE_CONFIG[range];
  const params = new URLSearchParams({
    start_time: String(nowMilliseconds - config.seconds * 1000),
    end_time: String(nowMilliseconds),
    limit: String(config.limit),
    interval: config.interval,
  });
  return fetchJsonWithRetry(
    `${MINSWAP_API_URL}/v1/assets/${tokenId}/price/candlestick?${params}`,
  );
}

export function normalizeMinswapCandles(payload: unknown): TokenCandle[] {
  if (!Array.isArray(payload)) return [];
  const candles = payload.flatMap((entry) => {
    const candle = asRecord(entry);
    if (!candle) return [];
    const timestamp = finiteNumber(candle.timestamp);
    const open = positiveNumber(candle.open);
    const high = positiveNumber(candle.high);
    const low = positiveNumber(candle.low);
    const close = positiveNumber(candle.close);
    const volume = nonNegativeNumber(candle.volume);
    if (
      timestamp == null || timestamp <= 0 || open == null || high == null ||
      low == null || close == null || volume == null ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high)
    ) {
      return [];
    }
    return [{
      time: Math.floor(timestamp >= 1_000_000_000_000 ? timestamp / 1000 : timestamp),
      open,
      high,
      low,
      close,
      volume,
    }];
  });

  return [...new Map(
    candles
      .sort((left, right) => left.time - right.time)
      .map((candle) => [candle.time, candle]),
  ).values()];
}

export interface MinswapAssetMetrics {
  priceAda: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volume24hAda: number | null;
  liquidityAda: number | null;
  marketCapAda: number | null;
}

export function parseMinswapAssetMetrics(payload: unknown): MinswapAssetMetrics | null {
  const data = asRecord(payload);
  if (!data) return null;
  const result = {
    priceAda: positiveNumber(data.price),
    change1h: finiteNumber(data.price_change_1h),
    change24h: finiteNumber(data.price_change_24h),
    change7d: finiteNumber(data.price_change_7d),
    volume24hAda: nonNegativeNumber(data.volume_24h),
    liquidityAda: nonNegativeNumber(data.liquidity),
    marketCapAda: nonNegativeNumber(data.market_cap),
  };
  return result.priceAda != null ? result : null;
}

function percentChange(candles: TokenCandle[], seconds: number) {
  const latest = candles.at(-1);
  const earliest = candles[0];
  if (!latest || !earliest || latest.time <= earliest.time) return null;
  if (latest.time - earliest.time < seconds * 0.8) return null;
  const target = latest.time - seconds;
  const start = candles.find((candle) => candle.time >= target) || candles[0];
  if (!start || start.time >= latest.time || start.open <= 0) return null;
  return ((latest.close - start.open) / start.open) * 100;
}

export function calculateTokenChanges(
  dayCandles: TokenCandle[],
  monthCandles: TokenCandle[],
): Record<TokenTimeframe, number | null> {
  return {
    "15m": percentChange(dayCandles, 15 * 60),
    "1h": percentChange(dayCandles, 60 * 60),
    "4h": percentChange(dayCandles, 4 * 60 * 60),
    "24h": percentChange(dayCandles, 24 * 60 * 60),
    "7d": percentChange(monthCandles, 7 * 86_400),
    "30d": percentChange(monthCandles, 30 * 86_400),
  };
}

async function loadAdaUsd() {
  const fetchedAt = new Date().toISOString();
  const [coinGecko, coinbase] = await Promise.allSettled([
    fetchJsonWithRetry(SOURCE_ENDPOINTS.coinGeckoPrice),
    fetchJsonWithRetry(SOURCE_ENDPOINTS.coinbasePrice),
  ]);

  if (coinGecko.status === "fulfilled") {
    const cardano = asRecord(asRecord(coinGecko.value)?.cardano);
    const usd = positiveNumber(cardano?.usd);
    const updatedAt = positiveNumber(cardano?.last_updated_at);
    if (usd != null && updatedAt != null && Date.now() - updatedAt * 1000 <= 4 * 60 * 60_000) {
      return { usd, at: new Date(updatedAt * 1000).toISOString(), source: "CoinGecko" };
    }
  }

  if (coinbase.status === "fulfilled") {
    const amount = positiveNumber(asRecord(asRecord(coinbase.value)?.data)?.amount);
    if (amount != null) return { usd: amount, at: fetchedAt, source: "Coinbase" };
  }

  return { usd: null, at: null, source: "Unavailable" };
}

export async function loadTokenAnalytics(
  token: DexTokenConfig,
  range: TokenChartRange,
): Promise<TokenAnalyticsData> {
  const generatedAt = new Date().toISOString();
  const nowMilliseconds = Date.now();
  const chartRequest = fetchMinswapCandles(token.tokenId, range, nowMilliseconds);
  const dayRequest = range === "24h"
    ? chartRequest
    : fetchMinswapCandles(token.tokenId, "24h", nowMilliseconds);
  const monthRequest = range === "30d"
    ? chartRequest
    : fetchMinswapCandles(token.tokenId, "30d", nowMilliseconds);
  const [adaUsd, requests] = await Promise.all([
    loadAdaUsd(),
    Promise.allSettled([
      fetchJsonWithRetry(`${MINSWAP_API_URL}/v1/assets/${token.tokenId}/metrics`),
      chartRequest,
      dayRequest,
      monthRequest,
    ]),
  ]);
  const [metricsResult, chartResult, dayResult, monthResult] = requests;

  const metrics = metricsResult.status === "fulfilled"
    ? parseMinswapAssetMetrics(metricsResult.value)
    : null;
  const candles = chartResult.status === "fulfilled"
    ? normalizeMinswapCandles(chartResult.value)
    : [];
  const dayCandles = dayResult.status === "fulfilled"
    ? normalizeMinswapCandles(dayResult.value)
    : [];
  const monthCandles = monthResult.status === "fulfilled"
    ? normalizeMinswapCandles(monthResult.value)
    : [];
  const derivedChanges = calculateTokenChanges(dayCandles, monthCandles);
  const tokenAda = metrics?.priceAda ?? null;
  const warnings = [
    "Minswap asset metrics and OHLCV describe Minswap-tracked trading, not aggregated activity across every Cardano DEX.",
    "Buy/sell split, order-book depth and holder concentration are not exposed by the Minswap public API and remain unavailable.",
  ];

  if (!metrics) {
    warnings.push("Minswap current asset metrics were unavailable; no secondary market-data fallback was used.");
  }
  if (!candles.length) {
    warnings.push(`Minswap returned no valid ${range} candles for this token and range.`);
  }

  const health = metrics && candles.length
    ? "healthy"
    : metrics || candles.length
      ? "degraded"
      : "error";

  return {
    schemaVersion: "1.0",
    generatedAt,
    configured: true,
    token,
    range,
    source: {
      health,
      label: "Minswap public token API",
      message: metrics || candles.length
        ? `Loaded Minswap ADA-denominated metrics and ${candles.length} verified candles. No secondary market-data fallback is used.`
        : "Public token metrics and chart data could not be loaded.",
      endpoint: `${MINSWAP_API_URL}/v1/assets/:asset`,
      expectedUpdateMinutes: 10,
    },
    price: {
      adaUsd: adaUsd.usd,
      adaUsdAt: adaUsd.at,
      adaUsdSource: adaUsd.source,
      tokenAda,
      tokenUsd: tokenAda != null && adaUsd.usd != null ? tokenAda * adaUsd.usd : null,
      tokenPerAda: tokenAda != null && tokenAda > 0 ? 1 / tokenAda : null,
      tokenPriceAt: tokenAda != null ? generatedAt : null,
    },
    market: {
      liquidityAda: metrics?.liquidityAda ?? null,
      volume24hAda: metrics?.volume24hAda ?? null,
      buys24h: null,
      sells24h: null,
      buyVolume24hAda: null,
      sellVolume24hAda: null,
      buyers24h: null,
      sellers24h: null,
      marketCapAda: metrics?.marketCapAda ?? null,
      holders: null,
      top10Pct: null,
      top100Pct: null,
    },
    changes: {
      ...derivedChanges,
      "1h": metrics?.change1h ?? derivedChanges["1h"],
      "24h": metrics?.change24h ?? derivedChanges["24h"],
      "7d": metrics?.change7d ?? derivedChanges["7d"],
    },
    candles,
    orderbook: null,
    warnings,
  };
}
