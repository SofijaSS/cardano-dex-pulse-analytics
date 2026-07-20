"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  BarChart3,
  Download,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { BrandLoader } from "@/components/BrandLoader";
import { DataSourceStatus } from "@/components/DataSourceStatus";
import { DateRangeSelector, type DatePreset } from "@/components/DateRangeSelector";
import { DexSelector } from "@/components/DexSelector";
import { DexTable, type DexTableColumnKey } from "@/components/DexTable";
import { MetricCard } from "@/components/MetricCard";
import { ThemeControl } from "@/components/ThemeControl";
import { WeeklySummary } from "@/components/WeeklySummary";
import { createBrowserPreferenceStore } from "@/lib/browser-preference";
import { safeDivide, safePercentChange } from "@/lib/calculations";
import {
  convertUsd,
  downloadCsv,
  formatDateTime,
  formatMoney,
  type Currency,
} from "@/lib/format";
import type { DashboardData, DexMetric, VolumeSeriesPoint } from "@/lib/types";

type SourceMode = "reconciled" | "defillama";

const DashboardCharts = dynamic(
  () => import("@/components/DashboardCharts").then((module) => module.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <BrandLoader
        compact
        label="Preparing interactive charts"
        detail="Loading the selected market range"
      />
    ),
  },
);

const currencyStore = createBrowserPreferenceStore<Currency>({
  key: "cardano-dex-pulse:currency",
  defaultValue: "ADA",
  values: ["ADA", "USD"],
});

function toDateInput(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function benchmarkRows(dexes: DexMetric[], benchmarkTotal24: number | null) {
  const rows = dexes.map((dex) => ({
    ...dex,
    volume24hUsd: dex.defillamaVolume24hUsd,
    volume7dUsd: dex.defillamaVolume7dUsd,
    volume30dUsd: dex.defillamaVolume30dUsd,
    previous7dUsd: dex.defillamaPrevious7dUsd,
    weekChangePct: safePercentChange(
      dex.defillamaVolume7dUsd,
      dex.defillamaPrevious7dUsd,
    ),
    volumeToTvl: safeDivide(dex.defillamaVolume24hUsd, dex.tvlUsd),
    marketShare24hPct:
      benchmarkTotal24 && dex.defillamaVolume24hUsd != null
        ? (dex.defillamaVolume24hUsd / benchmarkTotal24) * 100
        : null,
    trades24h: null,
    users24h: null,
    dau24h: null,
    fees24hUsd: null,
    fees7dUsd: null,
    marketCapUsd: null,
    marketCapToTvl: null,
    poolCount: null,
    variance24hPct: null,
    quality:
      dex.defillamaVolume24hUsd != null
        ? "benchmark-only" as const
        : "unavailable" as const,
    sourceLabel: "DefiLlama benchmark",
    periodNote:
      dex.rowKind === "version"
        ? "DefiLlama does not provide a version-level row for this configured protocol version."
        : "Benchmark view: values are displayed exactly as returned by DefiLlama.",
  }));
  const ranked = rows
    .filter((dex) => dex.volume7dUsd != null)
    .sort((a, b) => (b.volume7dUsd || 0) - (a.volume7dUsd || 0));
  for (const row of rows) {
    const rank = ranked.findIndex((dex) => dex.id === row.id);
    row.rank7d = rank >= 0 ? rank + 1 : null;
  }
  return rows.sort((a, b) => (b.volume7dUsd || 0) - (a.volume7dUsd || 0));
}

function filterSeries(
  series: VolumeSeriesPoint[],
  preset: DatePreset,
  customStart: string,
  customEnd: string,
) {
  if (!series.length) return [];
  const end = series[series.length - 1]?.timestamp || 0;
  let start = 0;
  let inclusiveEnd = end;

  if (preset === "custom") {
    start = customStart ? new Date(`${customStart}T00:00:00Z`).getTime() / 1000 : 0;
    inclusiveEnd = customEnd
      ? new Date(`${customEnd}T23:59:59Z`).getTime() / 1000
      : end;
  } else {
    const days = preset === "24h" ? 1 : Number.parseInt(preset, 10);
    start = end - days * 86_400;
  }

  return series.filter(
    (point) => point.timestamp >= start && point.timestamp <= inclusiveEnd,
  );
}

function LoadingState() {
  return (
    <BrandLoader
      label="Reconciling live DEX data"
      detail="Checking native APIs against the benchmark"
    />
  );
}

export function Dashboard({ authEnabled = false }: { authEnabled?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const preferredCurrency = useSyncExternalStore(
    currencyStore.subscribe,
    currencyStore.getSnapshot,
    currencyStore.getServerSnapshot,
  );
  const [sourceMode, setSourceMode] = useState<SourceMode>("reconciled");
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedDexes, setSelectedDexes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?request=${refreshKey}`, {
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
        return response.json() as Promise<DashboardData>;
      })
      .then((payload) => {
        setData(payload);
        setSelectedDexes((current) => {
          if (current.size) return current;
          const historical = payload.dexes.filter(
            (dex) => dex.rowKind === "protocol" && dex.defillamaVolume7dUsd != null,
          );
          const defaults = historical.slice(0, 5).map((dex) => dex.id);
          if (historical.some((dex) => dex.id === "wingriders")) {
            defaults.push("wingriders");
          }
          return new Set(defaults);
        });
        const latest = payload.benchmarkSeries[payload.benchmarkSeries.length - 1]?.timestamp;
        if (latest) {
          setCustomEnd(toDateInput(latest));
          setCustomStart(toDateInput(latest - 6 * 86_400));
        }
      })
      .catch((fetchError) => {
        if (!(fetchError instanceof Error && fetchError.name === "AbortError")) {
          setError(fetchError instanceof Error ? fetchError.message : "Unknown data error");
        }
      });
    return () => controller.abort();
  }, [refreshKey]);

  const refreshData = () => {
    setError(null);
    setRefreshKey((value) => value + 1);
  };

  if (!data && !error) return <LoadingState />;

  if (!data && error) {
    return (
      <main className="fatal-state">
        <AlertTriangle size={32} aria-hidden="true" />
        <h1>Dashboard data is temporarily unavailable</h1>
        <p>{error}</p>
        <button type="button" className="button button--primary" onClick={refreshData}>
          <RefreshCw size={15} aria-hidden="true" /> Retry all sources
        </button>
      </main>
    );
  }

  if (!data) return null;

  const adaPrice = data.price.usd;
  const currency: Currency = preferredCurrency === "ADA" && !adaPrice ? "USD" : preferredCurrency;
  const protocolDexes = data.dexes.filter((dex) => dex.rowKind === "protocol");
  const displayedDexes =
    sourceMode === "defillama"
      ? benchmarkRows(protocolDexes, data.aggregates.benchmark24hUsd)
      : protocolDexes;
  const tableDexes =
    sourceMode === "defillama"
      ? benchmarkRows(data.dexes, data.aggregates.benchmark24hUsd)
      : data.dexes;
  const aggregates = data.aggregates;
  const metric24 =
    sourceMode === "defillama"
      ? aggregates.benchmark24hUsd
      : aggregates.observed24hUsd;
  const metric7 =
    sourceMode === "defillama"
      ? aggregates.benchmark7dUsd
      : aggregates.observed7dUsd;
  const metric30 =
    sourceMode === "defillama"
      ? aggregates.benchmark30dUsd
      : aggregates.observed30dUsd;
  const metricTvl =
    sourceMode === "defillama"
      ? aggregates.benchmarkTvlUsd
      : aggregates.observedTvlUsd;
  const weekChange =
    sourceMode === "defillama"
      ? aggregates.benchmarkWeekChangePct
      : aggregates.comparableWeekChangePct;
  const monthChange =
    sourceMode === "defillama"
      ? aggregates.benchmarkMonthChangePct
      : aggregates.comparableMonthChangePct;
  const chartSeries = filterSeries(
    data.benchmarkSeries,
    preset,
    customStart,
    customEnd,
  );
  const minDate = data.benchmarkSeries[0]?.timestamp
    ? toDateInput(data.benchmarkSeries[0].timestamp)
    : "";
  const latestBenchmark = data.benchmarkSeries[data.benchmarkSeries.length - 1];
  const maxDate = latestBenchmark?.timestamp
    ? toDateInput(latestBenchmark.timestamp)
    : "";
  const sourceLabel =
    sourceMode === "defillama" ? "DefiLlama benchmark" : "Native-first reconciled";

  const toggleDex = (id: string) => {
    setSelectedDexes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportTable = (rows: DexMetric[], columns: DexTableColumnKey[]) => {
    const columnExporters: Record<
      DexTableColumnKey,
      { header: string; value: (dex: DexMetric) => unknown }
    > = {
      volume24hUsd: { header: `24h volume (${currency})`, value: (dex) => convertUsd(dex.volume24hUsd, currency, adaPrice) },
      volume7dUsd: { header: `7d volume (${currency})`, value: (dex) => convertUsd(dex.volume7dUsd, currency, adaPrice) },
      volume30dUsd: { header: `30d volume (${currency})`, value: (dex) => convertUsd(dex.volume30dUsd, currency, adaPrice) },
      previous7dUsd: { header: `Previous 7d (${currency})`, value: (dex) => convertUsd(dex.previous7dUsd, currency, adaPrice) },
      weekChangePct: { header: "WoW %", value: (dex) => dex.weekChangePct },
      trades24h: { header: "Trades (24h)", value: (dex) => dex.trades24h },
      users24h: { header: "Users (24h)", value: (dex) => dex.users24h },
      dau24h: { header: "DAU (24h)", value: (dex) => dex.dau24h },
      fees24hUsd: { header: `Fees (24h, ${currency})`, value: (dex) => convertUsd(dex.fees24hUsd, currency, adaPrice) },
      fees7dUsd: { header: `Fees (7d, ${currency})`, value: (dex) => convertUsd(dex.fees7dUsd, currency, adaPrice) },
      tvlUsd: { header: `TVL (${currency})`, value: (dex) => convertUsd(dex.tvlUsd, currency, adaPrice) },
      volumeToTvl: { header: "24h volume / TVL", value: (dex) => dex.volumeToTvl },
      marketCapUsd: { header: `Market cap (${currency})`, value: (dex) => convertUsd(dex.marketCapUsd, currency, adaPrice) },
      marketCapToTvl: { header: "Market cap / TVL", value: (dex) => dex.marketCapToTvl },
      poolCount: { header: "Pools observed", value: (dex) => dex.poolCount },
      marketShare24hPct: { header: "Observed 24h share %", value: (dex) => dex.marketShare24hPct },
      variance24hPct: { header: "Native vs DefiLlama %", value: (dex) => dex.variance24hPct },
      lastData: { header: "Last data (CET/CEST)", value: (dex) => formatDateTime(dex.lastDataAt) },
    };
    const selectedColumns = columns.map((column) => columnExporters[column]);

    downloadCsv(`cardano-dex-table-${sourceMode}-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        "DEX",
        "Row type",
        "Protocol version",
        "Rank (7d)",
        "Quality",
        "Source",
        ...selectedColumns.map((column) => column.header),
      ],
      ...rows.map((dex) => [
        dex.name,
        dex.rowKind,
        dex.protocolVersion,
        dex.rank7d,
        dex.quality,
        dex.sourceLabel,
        ...selectedColumns.map((column) => column.value(dex)),
      ]),
    ]);
  };

  const exportRange = () => {
    const selected = displayedDexes.filter((dex) => selectedDexes.has(dex.id));
    downloadCsv(`cardano-dex-range-${preset}-${currency.toLowerCase()}.csv`, [
      ["Date (CET/CEST)", `Total benchmark (${currency})`, ...selected.map((dex) => `${dex.name} (${currency})`)],
      ...chartSeries.map((point) => [
        formatDateTime(new Date(point.timestamp * 1000).toISOString()),
        convertUsd(point.totalUsd, currency, adaPrice),
        ...selected.map((dex) => convertUsd(point.byDex[dex.id] || 0, currency, adaPrice)),
      ]),
    ]);
  };

  return (
    <main className="dashboard">
      {data.mode === "mock" ? (
        <div className="mock-banner" role="alert">
          MOCK DATA MODE — synthetic development values are active and must not be used for reporting.
        </div>
      ) : null}

      <header className="topbar">
        <div className="topbar-start">
          <Link className="brand" href="/" aria-label="Cardano DEX Pulse home">
            <span className="brand-mark"><i /><i /><i /></span>
            <span><strong>Cardano DEX</strong><small>Pulse / Analytics</small></span>
          </Link>
          <div className="mobile-page-switcher" aria-label="Application pages">
            <Link className="is-active" href="/" aria-current="page">
              DEX volume
            </Link>
            <Link href="/tokens">
              <BarChart3 size={13} aria-hidden="true" /> Token charts
            </Link>
          </div>
        </div>
        <nav aria-label="Dashboard sections">
          <a href="#overview">Overview</a>
          <a href="#charts">Charts</a>
          <a href="#dex-table">DEXes</a>
          <a href="#weekly-report">Weekly brief</a>
          <Link href="/tokens">Token charts</Link>
        </nav>
        <div className="topbar-actions">
          <div className="currency-control" aria-label="Display currency">
            {(["ADA", "USD"] as Currency[]).map((option) => (
              <button
                type="button"
                key={option}
                className={currency === option ? "is-active" : ""}
                disabled={option === "ADA" && !adaPrice}
                onClick={() => currencyStore.set(option)}
                aria-pressed={currency === option}
              >
                {option}
              </button>
            ))}
          </div>
          <ThemeControl />
          {authEnabled ? (
            <form action="/api/auth/logout" method="post">
              <button className="logout-button" type="submit" title="Sign out">
                <LogOut size={15} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Source-reconciled intelligence</span>
          <h1>Cardano DEX volume, with the disagreement left visible.</h1>
          <p>Native exchange APIs lead. DefiLlama is retained as a transparent benchmark and historical fallback only after a live agreement check.</p>
        </div>
        <div className="hero-side">
          <div className="hero-source-status">
            <DataSourceStatus sources={data.sources} warnings={data.warnings} />
          </div>
          <div className="mode-control" aria-label="Data methodology">
            <button type="button" className={sourceMode === "reconciled" ? "is-active" : ""} onClick={() => startTransition(() => setSourceMode("reconciled"))} aria-pressed={sourceMode === "reconciled"}>
              Reconciled
              <small>Native-first</small>
            </button>
            <button type="button" className={sourceMode === "defillama" ? "is-active" : ""} onClick={() => startTransition(() => setSourceMode("defillama"))} aria-pressed={sourceMode === "defillama"}>
              Benchmark
              <small>DefiLlama</small>
            </button>
          </div>
          <div className="update-stamp">
            <span className="live-dot" />
            <div><small>Last reconciled</small><strong>{formatDateTime(data.generatedAt)}</strong></div>
            <button type="button" onClick={refreshData} aria-label="Refresh all data sources"><RefreshCw size={15} /></button>
          </div>
          <div className="price-stamp">
            <span>ADA / USD</span>
            <strong>{adaPrice ? `$${adaPrice.toFixed(4)}` : "Data unavailable"}</strong>
            <small>{data.price.source} · {formatDateTime(data.price.timestamp)}</small>
          </div>
        </div>
      </section>

      <section className="metrics-section" id="overview">
        <div className="section-kicker">
          <span>{sourceLabel}</span>
          <p>{sourceMode === "reconciled" ? "Observed coverage is shown with explicit DEX counts; unavailable periods are not extrapolated." : "Complete only within DefiLlama's own listed Cardano DEX coverage."}</p>
        </div>
        <div className="metrics-grid">
          <MetricCard featured label={sourceMode === "reconciled" ? "Observed volume · 24h" : "Total volume · 24h"} value={formatMoney(metric24, currency, adaPrice)} meta={sourceMode === "reconciled" ? `${aggregates.coverage24h}/${aggregates.trackedDexes} tracked DEXes report 24h data` : "DefiLlama Cardano DEX benchmark"} />
          <MetricCard label={sourceMode === "reconciled" ? "Observed volume · 7d" : "Total volume · 7d"} value={formatMoney(metric7, currency, adaPrice)} meta={sourceMode === "reconciled" ? `${aggregates.coverage7d}/${aggregates.trackedDexes} DEXes with comparable periods` : "DefiLlama Cardano DEX benchmark"} />
          <MetricCard label={sourceMode === "reconciled" ? "Observed volume · 30d" : "Total volume · 30d"} value={formatMoney(metric30, currency, adaPrice)} meta={sourceMode === "reconciled" ? `${aggregates.coverage30d}/${aggregates.trackedDexes} DEXes; no extrapolation` : "DefiLlama Cardano DEX benchmark"} />
          <MetricCard label="Tracked DEX TVL" value={formatMoney(metricTvl, currency, adaPrice)} meta={sourceMode === "reconciled" ? "Native where compatible, DefiLlama fallback" : "DefiLlama protocol TVL"} />
          <MetricCard label="Week-over-week" value={weekChange == null ? "N/A" : `${weekChange > 0 ? "+" : ""}${weekChange.toFixed(1)}%`} meta={sourceMode === "reconciled" ? "Same-source comparable DEX cohort" : "DefiLlama total 7d vs previous 7d"} change={weekChange} />
          <MetricCard label="Month-over-month" value={monthChange == null ? "Data unavailable" : `${monthChange > 0 ? "+" : ""}${monthChange.toFixed(1)}%`} meta={sourceMode === "reconciled" ? "Aligned native previous-30d data is incomplete" : "DefiLlama total 30d vs previous 30d"} change={monthChange} />
          <MetricCard label="Active tracked DEXes" value={String(aggregates.activeDexes)} meta={`${aggregates.trackedDexes} total rows in the configurable registry`} />
        </div>
      </section>

      <section className="analytics-section" id="charts">
        <div className="section-heading analytics-heading">
          <div>
            <span className="eyebrow">Market movement</span>
            <h2>Volume and efficiency</h2>
            <p>Historical charts remain explicitly benchmark-labelled because no public native API supplies one aligned ecosystem time series.</p>
          </div>
          <button type="button" className="button button--secondary" onClick={exportRange}>
            <Download size={15} aria-hidden="true" /> Export selected range
          </button>
        </div>
        <div className="chart-controls">
          <DateRangeSelector value={preset} onChange={(next) => startTransition(() => setPreset(next))} start={customStart} end={customEnd} onStartChange={setCustomStart} onEndChange={setCustomEnd} min={minDate} max={maxDate} />
          <DexSelector dexes={displayedDexes} selected={selectedDexes} onToggle={toggleDex} />
        </div>
        <DashboardCharts series={chartSeries} dexes={displayedDexes} selected={selectedDexes} currency={currency} adaPriceUsd={adaPrice} />
      </section>

      <WeeklySummary dexes={protocolDexes} currency={currency} adaPriceUsd={adaPrice} generatedAt={data.generatedAt} />
      <DexTable dexes={tableDexes} currency={currency} adaPriceUsd={adaPrice} onExport={exportTable} />

      <footer>
        <div className="footer-brand"><BarChart3 size={18} aria-hidden="true" /><strong>Cardano DEX Pulse</strong></div>
        <p>Decision support, not financial advice. Every unavailable field remains unavailable.</p>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
