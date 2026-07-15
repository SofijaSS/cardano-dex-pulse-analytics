const env = (name: string, fallback: string) => process.env[name] || fallback;

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
  wingriders: env(
    "WINGRIDERS_STATS_URL",
    "https://api.mainnet.wingriders.com/v1/defillama",
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

export const DATA_CACHE_SECONDS = Number(process.env.DATA_CACHE_SECONDS || 900);
export const USE_MOCK_DATA = process.env.USE_MOCK_DATA === "true";
