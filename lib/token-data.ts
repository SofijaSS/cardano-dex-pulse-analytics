import type { DexTokenConfig } from "@/config/tokens";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";
import type {
  TokenAnalyticsData,
  TokenCandle,
  TokenChartRange,
  TokenTimeframe,
} from "@/lib/token-types";

const MINSWAP_API_URL = SOURCE_ENDPOINTS.minswapApi.replace(/\/$/, "");
const DEXSCREENER_API_URL = SOURCE_ENDPOINTS.dexScreenerApi.replace(/\/$/, "");

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

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function fetchJson(url: string, init: RequestInit = {}) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        headers: { accept: "application/json", ...init.headers },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as unknown;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown request error");
      if (attempt < 2) await wait(250 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Request failed");
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
  return fetchJson(
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

export interface DexScreenerSnapshot {
  tokenAda: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairCount: number;
}

export function parseDexScreenerSnapshot(
  payload: unknown,
  tokenId: string,
): DexScreenerSnapshot | null {
  if (!Array.isArray(payload)) return null;
  const normalizedToken = tokenId.toLowerCase();
  const pairs = payload.flatMap((entry) => {
    const pair = asRecord(entry);
    const base = asRecord(pair?.baseToken);
    const quote = asRecord(pair?.quoteToken);
    const baseAddress = String(base?.address ?? "").toLowerCase();
    const quoteAddress = String(quote?.address ?? "").toLowerCase();
    const baseIsAda = baseAddress === "0x" || String(base?.symbol ?? "").toUpperCase() === "ADA";
    const quoteIsAda = quoteAddress === "0x" || String(quote?.symbol ?? "").toUpperCase() === "ADA";
    const tokenIsBase = baseAddress === normalizedToken;
    const tokenIsQuote = quoteAddress === normalizedToken;
    if (!(tokenIsBase && quoteIsAda) && !(tokenIsQuote && baseIsAda)) return [];

    const nativePrice = positiveNumber(pair?.priceNative);
    const tokenAda = nativePrice == null
      ? null
      : tokenIsBase ? nativePrice : 1 / nativePrice;
    const liquidity = asRecord(pair?.liquidity);
    const volume = asRecord(pair?.volume);
    const transactions = asRecord(asRecord(pair?.txns)?.h24);
    const reportedBuys = nonNegativeNumber(transactions?.buys);
    const reportedSells = nonNegativeNumber(transactions?.sells);
    return [{
      tokenAda,
      liquidityUsd: nonNegativeNumber(liquidity?.usd),
      marketCapUsd: tokenIsBase ? nonNegativeNumber(pair?.marketCap) : null,
      volume24hUsd: nonNegativeNumber(volume?.h24),
      buys24h: tokenIsBase ? reportedBuys : reportedSells,
      sells24h: tokenIsBase ? reportedSells : reportedBuys,
    }];
  });
  if (!pairs.length) return null;

  const best = [...pairs].sort(
    (left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1),
  )[0];
  const sumAvailable = (values: Array<number | null>) => {
    const available = values.filter((value): value is number => value != null);
    return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  };
  return {
    tokenAda: best.tokenAda,
    liquidityUsd: best.liquidityUsd,
    marketCapUsd: best.marketCapUsd,
    volume24hUsd: sumAvailable(pairs.map((pair) => pair.volume24hUsd)),
    buys24h: sumAvailable(pairs.map((pair) => pair.buys24h)),
    sells24h: sumAvailable(pairs.map((pair) => pair.sells24h)),
    pairCount: pairs.length,
  };
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
    fetchJson(SOURCE_ENDPOINTS.coinGeckoPrice),
    fetchJson(SOURCE_ENDPOINTS.coinbasePrice),
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
      fetchJson(`${MINSWAP_API_URL}/v1/assets/${token.tokenId}/metrics`),
      chartRequest,
      dayRequest,
      monthRequest,
      fetchJson(`${DEXSCREENER_API_URL}/token-pairs/v1/cardano/${token.tokenId}`),
    ]),
  ]);
  const [metricsResult, chartResult, dayResult, monthResult, dexScreenerResult] = requests;

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
  const dexScreener = dexScreenerResult.status === "fulfilled"
    ? parseDexScreenerSnapshot(dexScreenerResult.value, token.tokenId)
    : null;
  const derivedChanges = calculateTokenChanges(dayCandles, monthCandles);
  const tokenAda = metrics?.priceAda ?? dexScreener?.tokenAda ?? null;
  const warnings = [
    "Minswap asset metrics and OHLCV describe Minswap-tracked trading, not aggregated activity across every Cardano DEX.",
    "Order-book depth and holder concentration are not exposed by the selected public APIs and remain unavailable.",
  ];

  if (!metrics) {
    warnings.push("Minswap current asset metrics were unavailable; a verified DexScreener ADA pair is used only when present.");
  }
  if (!candles.length) {
    warnings.push(`Minswap returned no valid ${range} candles for this token and range.`);
  }
  if (!dexScreener) {
    warnings.push("DexScreener returned no ADA pair for independent current-price validation; no value was invented.");
  }
  if (metrics?.priceAda != null && dexScreener?.tokenAda != null) {
    const variance = Math.abs(metrics.priceAda - dexScreener.tokenAda) / metrics.priceAda * 100;
    if (variance > 15) {
      warnings.push(`Minswap and DexScreener current ADA prices differ by ${variance.toFixed(1)}%; Minswap remains primary and values are not averaged.`);
    }
  }

  const health = metrics && candles.length
    ? "healthy"
    : metrics || candles.length || dexScreener
      ? "degraded"
      : "error";
  const dexScreenerCoverage = dexScreener
    ? `DexScreener validated ${dexScreener.pairCount} ADA pair${dexScreener.pairCount === 1 ? "" : "s"}.`
    : "DexScreener ADA-pair validation was unavailable.";

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
        ? `Loaded public ADA-denominated metrics and ${candles.length} verified candles. ${dexScreenerCoverage}`
        : "Public token metrics and chart data could not be loaded.",
      endpoint: `${MINSWAP_API_URL}/v1/assets/:asset + ${DEXSCREENER_API_URL}/token-pairs/v1/cardano/:asset`,
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
      liquidityAda: metrics?.liquidityAda ?? (
        dexScreener?.liquidityUsd != null && adaUsd.usd != null
          ? dexScreener.liquidityUsd / adaUsd.usd
          : null
      ),
      volume24hAda: metrics?.volume24hAda ?? (
        dexScreener?.volume24hUsd != null && adaUsd.usd != null
          ? dexScreener.volume24hUsd / adaUsd.usd
          : null
      ),
      buys24h: dexScreener?.buys24h ?? null,
      sells24h: dexScreener?.sells24h ?? null,
      buyVolume24hAda: null,
      sellVolume24hAda: null,
      buyers24h: null,
      sellers24h: null,
      marketCapAda: metrics?.marketCapAda ?? (
        dexScreener?.marketCapUsd != null && adaUsd.usd != null
          ? dexScreener.marketCapUsd / adaUsd.usd
          : null
      ),
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
