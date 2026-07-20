import type { DexTokenConfig } from "@/config/tokens";

export type TokenTimeframe = "15m" | "1h" | "4h" | "24h" | "7d" | "30d";
export type TokenChartRange = TokenTimeframe | "90d" | "1y";

export interface TokenCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderbookPoint {
  price: number;
  amount: number;
  cumulative: number;
}

export interface TokenOrderbook {
  bids: OrderbookPoint[];
  asks: OrderbookPoint[];
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
}

export interface TokenAnalyticsData {
  schemaVersion: "1.0";
  generatedAt: string;
  configured: boolean;
  token: DexTokenConfig;
  range: TokenChartRange;
  source: {
    health: "healthy" | "degraded" | "error" | "unconfigured";
    label: string;
    message: string;
    endpoint: string;
    expectedUpdateMinutes: number;
  };
  price: {
    adaUsd: number | null;
    adaUsdAt: string | null;
    adaUsdSource: string;
    tokenAda: number | null;
    tokenUsd: number | null;
    tokenPerAda: number | null;
    tokenPriceAt: string | null;
  };
  market: {
    liquidityAda: number | null;
    volume24hAda: number | null;
    buys24h: number | null;
    sells24h: number | null;
    buyVolume24hAda: number | null;
    sellVolume24hAda: number | null;
    buyers24h: number | null;
    sellers24h: number | null;
    marketCapAda: number | null;
    holders: number | null;
    top10Pct: number | null;
    top100Pct: number | null;
  };
  changes: Record<TokenTimeframe, number | null>;
  candles: TokenCandle[];
  orderbook: TokenOrderbook | null;
  warnings: string[];
}
