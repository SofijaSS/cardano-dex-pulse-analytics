const env = (name: string, fallback: string) => process.env[name] || fallback;

const boundedNumber = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
};

export const SOURCE_ENDPOINTS = {
  defillamaVolume: env(
    "DEFILLAMA_VOLUME_URL",
    "https://api.llama.fi/overview/dexs/cardano?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false",
  ),
  defillamaProtocols: env(
    "DEFILLAMA_PROTOCOLS_URL",
    "https://api.llama.fi/protocols",
  ),
  coinGeckoPrice: env(
    "COINGECKO_PRICE_URL",
    "https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd&include_last_updated_at=true",
  ),
  coinbasePrice: env(
    "COINBASE_PRICE_URL",
    "https://api.coinbase.com/v2/prices/ADA-USD/spot",
  ),
  minswapPools: env(
    "MINSWAP_POOLS_URL",
    "https://api-mainnet-prod.minswap.org/v1/pools/metrics",
  ),
  minswapApi: env(
    "MINSWAP_API_URL",
    "https://api-mainnet-prod.minswap.org",
  ),
  minswapMarketInsights: env(
    "MINSWAP_MARKET_INSIGHTS_URL",
    "https://api-internal.minswap.org/api/v1/market/dex-analytic?timeframe=6M",
  ),
  wingriders: env(
    "WINGRIDERS_STATS_URL",
    "https://api.mainnet.wingriders.com/v1/defillama",
  ),
  wingridersGraphql: env(
    "WINGRIDERS_GRAPHQL_URL",
    "https://api.mainnet.wingriders.com/graphql",
  ),
  poolflowMarkets: env(
    "POOLFLOW_MARKETS_URL",
    "https://api.poolflow.net/api/own/market-overview",
  ),
  sundaeswap: env("SUNDAESWAP_GRAPHQL_URL", "https://api.sundae.fi/graphql"),
  splash: env(
    "SPLASH_STATS_URL",
    "https://analytics.splash.trade/platform-api/v1/platform/stats",
  ),
  muesliVolume: env(
    "MUESLISWAP_VOLUME_URL",
    "https://aggregator-analytics-v2.muesliswap.com/muesli-protocol-volume?interval=day&days=60",
  ),
  muesliTvl: env(
    "MUESLISWAP_TVL_URL",
    "https://aggregator-analytics-v2.muesliswap.com/muesli-tvl?days=2",
  ),
  vyfinance: env(
    "VYFINANCE_STATS_URL",
    "https://api-v3.vyfi.io/fetchmaster?data=allPoolsAnalytics",
  ),
  dano: env(
    "DANO_STATS_URL",
    "https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions",
  ),
  delta: env(
    "DELTA_STATS_URL",
    "https://api-internal-metrics.deltadefi.io/public/volume/daily",
  ),
  saturn: env(
    "SATURN_STATS_URL",
    "https://api.saturnswap.io/v1/defillama/volume",
  ),
} as const;

export const DATA_CACHE_SECONDS = boundedNumber("DATA_CACHE_SECONDS", 300, 30, 3_600);
export const DATA_STALE_SECONDS = boundedNumber("DATA_STALE_SECONDS", 1_800, 60, 86_400);
export const TOKEN_CACHE_SECONDS = boundedNumber("TOKEN_CACHE_SECONDS", 300, 60, 3_600);
export const PRICE_REFRESH_SECONDS = boundedNumber("PRICE_REFRESH_SECONDS", 300, 60, 3_600);
export const DEX_REFRESH_SECONDS = boundedNumber("DEX_REFRESH_SECONDS", 3_600, 300, 21_600);
export const BENCHMARK_REFRESH_SECONDS = boundedNumber(
  "BENCHMARK_REFRESH_SECONDS",
  43_200,
  3_600,
  86_400,
);
export const SOURCE_FETCH_TIMEOUT_MS = boundedNumber("SOURCE_FETCH_TIMEOUT_MS", 7_000, 2_000, 20_000);
export const SOURCE_FETCH_ATTEMPTS = Math.floor(
  boundedNumber("SOURCE_FETCH_ATTEMPTS", 2, 1, 4),
);
export const USE_MOCK_DATA = process.env.USE_MOCK_DATA === "true";
