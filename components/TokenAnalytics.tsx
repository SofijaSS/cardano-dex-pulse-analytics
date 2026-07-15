"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  Database,
  ExternalLink,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DEX_TOKEN_REGISTRY, type DexTokenId } from "@/config/tokens";
import { ThemeControl } from "@/components/ThemeControl";
import { TokenCandleChart, TokenDepthChart } from "@/components/TokenCandleChart";
import type {
  TokenAnalyticsData,
  TokenChartRange,
  TokenTimeframe,
} from "@/lib/token-types";

const CHART_RANGES: Array<{ id: TokenChartRange; label: string }> = [
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

const TIMEFRAMES: Array<{ id: TokenTimeframe; label: string }> = [
  { id: "15m", label: "15M" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
];

function formatPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Data unavailable";
  if (value >= 1_000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 5 });
  if (value >= 0.01) return value.toFixed(5);
  return value.toPrecision(5);
}

function formatCompact(value: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "Data unavailable";
  return `${new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 2 : 0,
  }).format(value)}${suffix}`;
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatUtc(value: string | null) {
  if (!value) return "Timestamp unavailable";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function TokenLoading() {
  return (
    <div className="token-loading" aria-busy="true">
      <span />
      <span />
      <div><i /><i /><i /></div>
    </div>
  );
}

function SourcePill({ data }: { data: TokenAnalyticsData }) {
  return (
    <span className={`token-source-pill token-source-pill--${data.source.health}`} title={data.source.message}>
      <i />
      {data.source.health === "healthy" ? "DEX Hunter live" : data.source.health === "unconfigured" ? "DEX Hunter setup needed" : "DEX Hunter degraded"}
    </span>
  );
}

export function TokenAnalytics({ authEnabled = false }: { authEnabled?: boolean }) {
  const [selectedToken, setSelectedToken] = useState<DexTokenId>("wrt");
  const [range, setRange] = useState<TokenChartRange>("30d");
  const [data, setData] = useState<TokenAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clock, setClock] = useState<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey((current) => current + 1);
      setClock(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/tokens?token=${selectedToken}&range=${range}&request=${refreshKey}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace("/login");
          throw new DOMException("Session expired", "AbortError");
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<TokenAnalyticsData>;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((fetchError) => {
        if (active && !(fetchError instanceof Error && fetchError.name === "AbortError")) {
          setError(fetchError instanceof Error ? fetchError.message : "Unknown token data error");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [range, refreshKey, selectedToken]);

  const token = data?.token || DEX_TOKEN_REGISTRY.find((entry) => entry.id === selectedToken)!;
  const change24h = data?.changes["24h"] ?? null;
  const totalTrades = (data?.market.buys24h || 0) + (data?.market.sells24h || 0);
  const buyShare = totalTrades > 0 ? ((data?.market.buys24h || 0) / totalTrades) * 100 : null;
  const isStale = data && clock != null
    ? clock - new Date(data.generatedAt).getTime() > data.source.expectedUpdateMinutes * 60_000
    : false;

  return (
    <main className="dashboard token-dashboard">
      <header className="topbar token-topbar">
        <Link className="brand" href="/" aria-label="Cardano DEX Pulse home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Cardano DEX</strong><small>Pulse / Analytics</small></span>
        </Link>
        <nav aria-label="Application pages">
          <Link href="/">DEX volume</Link>
          <Link className="is-active" href="/tokens">Token charts</Link>
        </nav>
        <div className="topbar-actions">
          {data ? <SourcePill data={data} /> : null}
          <ThemeControl />
          {authEnabled ? (
            <form action="/api/auth/logout" method="post">
              <button className="logout-button" type="submit" title="Sign out">
                <LogOut size={15} aria-hidden="true" /><span>Sign out</span>
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <section className="token-page-hero">
        <div>
          <span className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Verified token intelligence</span>
          <h1>Cardano DEX token charts</h1>
          <p>DEX Hunter market data, with missing fields kept visible and no synthetic values.</p>
        </div>
        <div className="token-live-stamp">
          <span className={isStale ? "is-stale" : ""} />
          <div><small>Last token refresh</small><strong>{formatUtc(data?.generatedAt || null)}</strong></div>
          <button type="button" onClick={() => {
            setLoading(true);
            setError(null);
            setRefreshKey((current) => current + 1);
          }} aria-label="Refresh token data"><RefreshCw size={16} /></button>
        </div>
      </section>

      <section className="token-selector-section" aria-label="DEX governance tokens">
        {DEX_TOKEN_REGISTRY.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={selectedToken === entry.id ? "is-active" : ""}
            onClick={() => {
              setLoading(true);
              setError(null);
              setData(null);
              startTransition(() => setSelectedToken(entry.id));
            }}
            aria-pressed={selectedToken === entry.id}
          >
            <span className="token-mark" style={{ "--token-color": entry.color } as CSSProperties}>{entry.ticker.slice(0, 2)}</span>
            <span><strong>{entry.dexName}</strong><small>{entry.ticker}</small></span>
          </button>
        ))}
      </section>

      {error && !data ? (
        <section className="token-fatal-state">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Token data is temporarily unavailable</h2>
          <p>{error}</p>
          <button type="button" className="button button--primary" onClick={() => {
            setLoading(true);
            setError(null);
            setRefreshKey((current) => current + 1);
          }}><RefreshCw size={15} /> Retry</button>
        </section>
      ) : null}

      {!data ? <TokenLoading /> : (
        <>
          <section className="token-market-header">
            <div className="token-identity">
              <span className="token-mark token-mark--large" style={{ "--token-color": token.color } as CSSProperties}>{token.ticker.slice(0, 2)}</span>
              <div><span>{token.dexName}</span><h2>{token.ticker} / ADA</h2><p>{token.tokenName}</p></div>
            </div>
            <div className="token-current-price">
              <span>Current DEX Hunter price</span>
              <strong>{formatPrice(data.price.tokenAda)}</strong>
              <small className={change24h == null ? "" : change24h >= 0 ? "positive" : "negative"}>{formatPercent(change24h)} · 24H</small>
            </div>
            <article><span>Market cap</span><strong>{formatCompact(data.market.marketCapAda, " ADA")}</strong><small>Not exposed by documented API</small></article>
            <article><span>Liquidity</span><strong>{formatCompact(data.market.liquidityAda, " ADA")}</strong><small>Sum of returned ADA pools</small></article>
            <article><span>24H volume</span><strong>{formatCompact(data.market.volume24hAda, " ADA")}</strong><small>DEX Hunter daily stats</small></article>
          </section>

          <section className="token-price-strip">
            <article><span>ADA / USD</span><strong>{data.price.adaUsd == null ? "Data unavailable" : `$${formatPrice(data.price.adaUsd)}`}</strong><small>{data.price.adaUsdSource} · {formatUtc(data.price.adaUsdAt)}</small></article>
            <article><span>{token.ticker} / ADA</span><strong>{formatPrice(data.price.tokenAda)}{data.price.tokenAda != null ? " ADA" : ""}</strong><small>DEX Hunter average price</small></article>
            <article><span>ADA / {token.ticker}</span><strong>{formatPrice(data.price.tokenPerAda)}{data.price.tokenPerAda != null ? ` ${token.ticker}` : ""}</strong><small>Calculated inverse; zero protected</small></article>
            <article><span>{token.ticker} / USD</span><strong>{data.price.tokenUsd == null ? "Data unavailable" : `$${formatPrice(data.price.tokenUsd)}`}</strong><small>Token/ADA × fresh ADA/USD</small></article>
          </section>

          <section className="token-workspace">
            <div className="token-chart-panel">
              <header>
                <div><span className="eyebrow">DEX Hunter OHLCV</span><h2>{token.ticker}_ADA market</h2><p>Price candles and reported pair volume. Hover a candle for exact OHLCV values.</p></div>
                <a className="button button--secondary" href={data.dexHunterUrl} target="_blank" rel="noreferrer">Open on DEX Hunter <ExternalLink size={14} /></a>
              </header>
              <div className="token-range-control" aria-label="Chart date range">
                {CHART_RANGES.map((option) => (
                  <button type="button" key={option.id} className={range === option.id ? "is-active" : ""} onClick={() => {
                    setLoading(true);
                    setError(null);
                    startTransition(() => setRange(option.id));
                  }} aria-pressed={range === option.id}>{option.label}</button>
                ))}
                <span>{loading ? "Refreshing…" : `${data.candles.length} verified candles`}</span>
              </div>
              <TokenCandleChart candles={data.candles} ticker={token.ticker} />
              <p className="token-chart-note">Source: DEX Hunter Partner Charts API. Candle periods are selected automatically for the active range. Provider responses do not include an authoritative publish timestamp, so the server fetch time is shown.</p>
            </div>

            <aside className="token-side-panel">
              <section>
                <div className="token-panel-title"><span>Timeframe</span><i /></div>
                <div className="timeframe-grid">
                  {TIMEFRAMES.map((timeframe) => {
                    const value = data.changes[timeframe.id];
                    return <article key={timeframe.id} className={timeframe.id === "24h" ? "is-active" : ""}><span>{timeframe.label}</span><strong className={value == null ? "" : value >= 0 ? "positive" : "negative"}>{formatPercent(value)}</strong></article>;
                  })}
                </div>
              </section>

              <section>
                <div className="token-panel-title"><span>Buy vs sell · 24H</span><i /></div>
                <div className="trade-balance"><strong>{formatCompact(data.market.buys24h)}</strong><strong>{formatCompact(data.market.sells24h)}</strong></div>
                <div className="trade-balance-bar"><i style={{ width: `${buyShare ?? 50}%` }} /></div>
                <dl className="trade-stats">
                  <div><dt>Buys</dt><dd>{formatCompact(data.market.buys24h)}</dd></div>
                  <div><dt>Sells</dt><dd>{formatCompact(data.market.sells24h)}</dd></div>
                  <div><dt>Buy volume</dt><dd>{formatCompact(data.market.buyVolume24hAda, " ADA")}</dd></div>
                  <div><dt>Sell volume</dt><dd>{formatCompact(data.market.sellVolume24hAda, " ADA")}</dd></div>
                  <div><dt>Buyers</dt><dd>{formatCompact(data.market.buyers24h)}</dd></div>
                  <div><dt>Sellers</dt><dd>{formatCompact(data.market.sellers24h)}</dd></div>
                </dl>
              </section>
            </aside>
          </section>

          <section className="token-depth-section">
            <div className="token-depth-panel">
              <header><div><span className="eyebrow">Limit order liquidity</span><h2>Order-book depth</h2></div><Database size={18} aria-hidden="true" /></header>
              <div className="depth-metrics">
                <article className="is-bid"><span>Best bid</span><strong>{formatPrice(data.orderbook?.bestBid ?? null)}</strong></article>
                <article><span>Spread</span><strong>{formatPercent(data.orderbook?.spreadPct ?? null)}</strong></article>
                <article className="is-ask"><span>Best ask</span><strong>{formatPrice(data.orderbook?.bestAsk ?? null)}</strong></article>
              </div>
              <TokenDepthChart orderbook={data.orderbook} />
            </div>
            <div className="token-holder-panel">
              <header><div><span className="eyebrow">Token distribution</span><h2>Holder concentration</h2></div><Users size={18} aria-hidden="true" /></header>
              <div>
                <article><Users size={17} /><span>Holders</span><strong>{formatCompact(data.market.holders)}</strong></article>
                <article><BarChart3 size={17} /><span>Top 10</span><strong>{formatPercent(data.market.top10Pct)}</strong></article>
                <article><BarChart3 size={17} /><span>Top 100</span><strong>{formatPercent(data.market.top100Pct)}</strong></article>
              </div>
              <p>DEX Hunter’s documented Partner API does not expose holder counts or concentration. These fields remain unavailable rather than being copied from an unverified source.</p>
            </div>
          </section>

          <section className={`token-data-quality token-data-quality--${data.source.health}`}>
            <div><span className="eyebrow">Data quality</span><h2>{data.source.label}</h2><p>{data.source.message}</p></div>
            <ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        </>
      )}

      <footer className="token-footer">
        <div className="footer-brand"><BarChart3 size={18} aria-hidden="true" /><strong>Cardano DEX Pulse</strong></div>
        <p>Token analytics are decision support, not financial advice.</p>
        <Link href="/">Return to DEX volume</Link>
      </footer>
    </main>
  );
}
