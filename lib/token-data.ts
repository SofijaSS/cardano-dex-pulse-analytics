import { dexHunterUrl, type DexTokenConfig } from "@/config/tokens";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";
import type {
  OrderbookPoint,
  TokenAnalyticsData,
  TokenCandle,
  TokenChartRange,
  TokenOrderbook,
  TokenTimeframe,
} from "@/lib/token-types";

const DEXHUNTER_API_URL =
  process.env.DEXHUNTER_API_URL || "https://api-us.dexhunterv3.app";
const DEXHUNTER_CHARTS_URL =
  process.env.DEXHUNTER_CHARTS_URL || "https://charts.dhapi.io";

export const TOKEN_RANGE_CONFIG: Record<
  TokenChartRange,
  { seconds: number; period: string }
> = {
  "24h": { seconds: 86_400, period: "15min" },
  "7d": { seconds: 7 * 86_400, period: "1hour" },
  "30d": { seconds: 30 * 86_400, period: "4hour" },
  "90d": { seconds: 90 * 86_400, period: "1day" },
  "1y": { seconds: 365 * 86_400, period: "1week" },
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

async function fetchDexHunter(path: string, partnerId: string, init: RequestInit = {}) {
  return fetchJson(`${DEXHUNTER_API_URL}${path}`, {
    ...init,
    headers: {
      "X-Partner-Id": partnerId,
      ...init.headers,
    },
  });
}

async function fetchCandles(
  tokenId: string,
  partnerId: string,
  range: TokenChartRange,
  nowSeconds: number,
) {
  const config = TOKEN_RANGE_CONFIG[range];
  return fetchJson(`${DEXHUNTER_CHARTS_URL}/charts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Partner-Id": partnerId,
    },
    body: JSON.stringify({
      tokenIn: "",
      tokenOut: tokenId,
      period: config.period,
      from: nowSeconds - config.seconds,
      to: nowSeconds,
    }),
  });
}

export function normalizeDexHunterCandles(payload: unknown): TokenCandle[] {
  const record = asRecord(payload);
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : [];
  const candles = raw.flatMap((entry) => {
    const candle = asRecord(entry);
    if (!candle) return [];
    const time = finiteNumber(candle.time);
    const open = positiveNumber(candle.open);
    const high = positiveNumber(candle.high);
    const low = positiveNumber(candle.low);
    const close = positiveNumber(candle.close);
    const volume = finiteNumber(candle.volume);
    if (
      time == null || open == null || high == null || low == null ||
      close == null || volume == null || volume < 0 ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high)
    ) {
      return [];
    }
    return [{ time, open, high, low, close, volume }];
  });

  return [...new Map(
    candles
      .sort((left, right) => left.time - right.time)
      .map((candle) => [candle.time, candle]),
  ).values()];
}

export function sumDexHunterLiquidityAda(payload: unknown) {
  const record = asRecord(payload);
  const pools = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : [];
  const values = pools
    .map((pool) => positiveNumber(asRecord(pool)?.token_1_amount))
    .filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function bookPoint(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const price = positiveNumber(record.price ?? record.wanted_price);
  const amount = positiveNumber(
    record.amount ?? record.amount_in ?? record.token_amount,
  );
  return price != null && amount != null ? { price, amount } : null;
}

function cumulativePoints(
  values: Array<{ price: number; amount: number }>,
  direction: "asc" | "desc",
): OrderbookPoint[] {
  let cumulative = 0;
  return values
    .sort((left, right) =>
      direction === "asc" ? left.price - right.price : right.price - left.price,
    )
    .slice(0, 40)
    .map((point) => {
      cumulative += point.amount;
      return { ...point, cumulative };
    });
}

export function parseDexHunterOrderbook(payload: unknown): TokenOrderbook | null {
  const outer = asRecord(payload);
  const data = asRecord(outer?.data) || outer;
  const arrayPayload = Array.isArray(outer?.data)
    ? outer.data
    : Array.isArray(payload)
      ? payload
      : null;
  let rawBids = data?.bids ?? data?.buy_orders;
  let rawAsks = data?.asks ?? data?.sell_orders;

  if ((!Array.isArray(rawBids) || !Array.isArray(rawAsks)) && arrayPayload) {
    rawBids = arrayPayload.filter((item) => {
      const side = String(asRecord(item)?.side ?? asRecord(item)?.type ?? "").toLowerCase();
      return side === "bid" || side === "buy";
    });
    rawAsks = arrayPayload.filter((item) => {
      const side = String(asRecord(item)?.side ?? asRecord(item)?.type ?? "").toLowerCase();
      return side === "ask" || side === "sell";
    });
  }

  if (!Array.isArray(rawBids) || !Array.isArray(rawAsks)) return null;
  const bids = cumulativePoints(
    rawBids.map(bookPoint).filter((point): point is { price: number; amount: number } => point != null),
    "desc",
  );
  const asks = cumulativePoints(
    rawAsks.map(bookPoint).filter((point): point is { price: number; amount: number } => point != null),
    "asc",
  );
  if (!bids.length && !asks.length) return null;

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const midpoint = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spreadPct =
    bestBid != null && bestAsk != null && midpoint && midpoint > 0
      ? ((bestAsk - bestBid) / midpoint) * 100
      : null;
  return { bids, asks, bestBid, bestAsk, spreadPct };
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

function parseTokenPrice(payload: unknown) {
  const record = asRecord(payload);
  return positiveNumber(record?.price_ba ?? asRecord(record?.data)?.price_ba);
}

function parseDailyStats(payload: unknown) {
  const record = asRecord(payload);
  const data = asRecord(record?.data) || record;
  return {
    buys: finiteNumber(data?.daily_buys_count),
    sells: finiteNumber(data?.daily_sales_count),
    volumeAda: finiteNumber(data?.daily_volume),
  };
}

export async function loadTokenAnalytics(
  token: DexTokenConfig,
  range: TokenChartRange,
): Promise<TokenAnalyticsData> {
  const generatedAt = new Date().toISOString();
  const partnerId = process.env.DEXHUNTER_PARTNER_ID?.trim() || "";
  const adaUsd = await loadAdaUsd();
  const emptyChanges: Record<TokenTimeframe, null> = {
    "15m": null,
    "1h": null,
    "4h": null,
    "24h": null,
    "7d": null,
    "30d": null,
  };

  const base: TokenAnalyticsData = {
    schemaVersion: "1.0",
    generatedAt,
    configured: Boolean(partnerId),
    token,
    range,
    dexHunterUrl: dexHunterUrl(token.tokenId),
    source: {
      health: partnerId ? "error" : "unconfigured",
      label: "DEX Hunter Partner API",
      message: partnerId
        ? "DEX Hunter data could not be loaded."
        : "DEX Hunter connection is not configured. Live token fields remain unavailable.",
      endpoint: `${DEXHUNTER_API_URL} + ${DEXHUNTER_CHARTS_URL}`,
      expectedUpdateMinutes: 5,
    },
    price: {
      adaUsd: adaUsd.usd,
      adaUsdAt: adaUsd.at,
      adaUsdSource: adaUsd.source,
      tokenAda: null,
      tokenUsd: null,
      tokenPerAda: null,
      tokenPriceAt: null,
    },
    market: {
      liquidityAda: null,
      volume24hAda: null,
      buys24h: null,
      sells24h: null,
      buyVolume24hAda: null,
      sellVolume24hAda: null,
      buyers24h: null,
      sellers24h: null,
      marketCapAda: null,
      holders: null,
      top10Pct: null,
      top100Pct: null,
    },
    changes: emptyChanges,
    candles: [],
    orderbook: null,
    warnings: [
      "DEX Hunter does not document market-cap or holder-concentration fields in the Partner API; those values are not estimated.",
    ],
  };

  if (!partnerId) {
    base.warnings.unshift(
      "Add DEXHUNTER_PARTNER_ID to the server environment to enable live token charts.",
    );
    return base;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const requests = await Promise.allSettled([
    fetchDexHunter(`/swap/averagePrice/ADA/${token.tokenId}`, partnerId),
    fetchDexHunter(`/stats/pools/ADA/${token.tokenId}`, partnerId),
    fetchDexHunter(`/stats/daily_stats/ADA/${token.tokenId}`, partnerId),
    fetchDexHunter(`/swap/limit_orders/ADA/${token.tokenId}`, partnerId),
    fetchCandles(token.tokenId, partnerId, range, nowSeconds),
    fetchCandles(token.tokenId, partnerId, "24h", nowSeconds),
    fetchCandles(token.tokenId, partnerId, "30d", nowSeconds),
  ]);
  const [priceResult, poolsResult, dailyResult, bookResult, chartResult, dayResult, monthResult] = requests;
  const failures: string[] = [];

  const tokenAda = priceResult.status === "fulfilled"
    ? parseTokenPrice(priceResult.value)
    : null;
  if (priceResult.status === "rejected" || tokenAda == null) failures.push("current token price");

  const liquidityAda = poolsResult.status === "fulfilled"
    ? sumDexHunterLiquidityAda(poolsResult.value)
    : null;
  if (poolsResult.status === "rejected" || liquidityAda == null) failures.push("pool liquidity");

  const daily = dailyResult.status === "fulfilled"
    ? parseDailyStats(dailyResult.value)
    : { buys: null, sells: null, volumeAda: null };
  if (dailyResult.status === "rejected") failures.push("24h trade statistics");

  const candles = chartResult.status === "fulfilled"
    ? normalizeDexHunterCandles(chartResult.value)
    : [];
  const dayCandles = dayResult.status === "fulfilled"
    ? normalizeDexHunterCandles(dayResult.value)
    : [];
  const monthCandles = monthResult.status === "fulfilled"
    ? normalizeDexHunterCandles(monthResult.value)
    : [];
  if (!candles.length) failures.push("OHLCV chart");

  const orderbook = bookResult.status === "fulfilled"
    ? parseDexHunterOrderbook(bookResult.value)
    : null;
  if (!orderbook) {
    base.warnings.push(
      "DEX Hunter order-book depth is shown only when the endpoint returns explicit bid/ask prices and amounts.",
    );
  }

  base.price.tokenAda = tokenAda;
  base.price.tokenUsd = tokenAda != null && adaUsd.usd != null ? tokenAda * adaUsd.usd : null;
  base.price.tokenPerAda = tokenAda != null && tokenAda > 0 ? 1 / tokenAda : null;
  base.price.tokenPriceAt = tokenAda != null ? generatedAt : null;
  base.market.liquidityAda = liquidityAda;
  base.market.volume24hAda = daily.volumeAda;
  base.market.buys24h = daily.buys;
  base.market.sells24h = daily.sells;
  base.changes = calculateTokenChanges(dayCandles, monthCandles);
  base.candles = candles;
  base.orderbook = orderbook;
  base.source.health = failures.length
    ? tokenAda != null || candles.length ? "degraded" : "error"
    : "healthy";
  base.source.message = failures.length
    ? `Unavailable from the current response: ${failures.join(", ")}.`
    : "Live DEX Hunter price, market and OHLCV responses loaded successfully.";
  return base;
}
