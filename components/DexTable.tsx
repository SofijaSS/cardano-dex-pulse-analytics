"use client";

import { Fragment, useDeferredValue, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatRatio,
  type Currency,
} from "@/lib/format";
import type { DexMetric, QualityFlag } from "@/lib/types";

type SortKey =
  | "name"
  | "rank7d"
  | "volume24hUsd"
  | "volume7dUsd"
  | "volume30dUsd"
  | "previous7dUsd"
  | "weekChangePct"
  | "trades24h"
  | "users24h"
  | "dau24h"
  | "fees24hUsd"
  | "fees7dUsd"
  | "tvlUsd"
  | "volumeToTvl"
  | "marketCapUsd"
  | "marketCapToTvl"
  | "poolCount"
  | "marketShare24hPct"
  | "variance24hPct";

function formatCount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Data unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function sourceVariance(row: DexMetric) {
  const native = row.nativeVolume24hUsd;
  const benchmark = row.defillamaVolume24hUsd;
  if (native == null || benchmark == null || benchmark === 0) return null;
  return ((native - benchmark) / benchmark) * 100;
}

const COLUMN_COUNT = 19;

function SortableHeader({
  label,
  field,
  sortKey,
  direction,
  onSort,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  direction: "asc" | "desc";
  onSort: (field: SortKey) => void;
}) {
  const active = field === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button type="button" className={active ? "table-sort is-active" : "table-sort"} onClick={() => onSort(field)}>
      {label}
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

const qualityLabels: Record<QualityFlag, string> = {
  aligned: "Aligned",
  "material-variance": "Variance",
  "native-only": "Native only",
  "benchmark-only": "Benchmark only",
  unavailable: "Unavailable",
};

export function DexTable({
  dexes,
  currency,
  adaPriceUsd,
  onExport,
}: {
  dexes: DexMetric[];
  currency: Currency;
  adaPriceUsd: number | null;
  onExport: (rows: DexMetric[]) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [quality, setQuality] = useState<"all" | QualityFlag>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume24hUsd");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleSort = (field: SortKey) => {
    if (field === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setDirection(field === "name" ? "asc" : "desc");
    }
  };

  const detailRows = new Map(
    dexes
      .filter((dex) => dex.tableRole === "detail")
      .map((dex) => [dex.id, dex]),
  );
  const primaryDexes = dexes.filter((dex) => dex.tableRole === "primary");
  const volumeRanks = new Map(
    [...primaryDexes]
      .filter((dex) => dex.volume24hUsd != null)
      .sort((left, right) =>
        (right.volume24hUsd || 0) - (left.volume24hUsd || 0) ||
        left.name.localeCompare(right.name),
      )
      .map((dex, index) => [dex.id, index + 1]),
  );

  const filtered = primaryDexes
    .filter((dex) => {
      const matchesQuery = `${dex.name} ${dex.protocolVersion || ""} ${dex.sourceLabel}`
        .toLowerCase()
        .includes(deferredQuery.trim().toLowerCase());
      const parentQuality = dex.parentId ? detailRows.get(dex.parentId)?.quality : null;
      return matchesQuery && (
        quality === "all" || dex.quality === quality || parentQuality === quality
      );
    })
    .sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      if (a == null && b == null) return left.name.localeCompare(right.name);
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b)
          : Number(a) - Number(b);
      if (comparison === 0) return left.name.localeCompare(right.name);
      return direction === "asc" ? comparison : -comparison;
    });

  const toggleDetails = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const headerProps = { sortKey, direction, onSort: handleSort };

  return (
    <section className="table-section" id="dex-table">
      <div className="section-heading table-heading">
        <div>
          <span className="eyebrow">Exchange detail</span>
          <h2>DEX performance table</h2>
          <p>Individual DEX versions ranked by current volume. Protocol totals stay inside source details.</p>
        </div>
        <div className="table-actions">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Filter DEXes</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter DEXes" />
          </label>
          <label className="select-field">
            <span className="sr-only">Filter by source quality</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value as "all" | QualityFlag)}>
              <option value="all">All quality states</option>
              {Object.entries(qualityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="button button--secondary" onClick={() => onExport(filtered)}>
            <Download size={15} aria-hidden="true" />
            Export table
          </button>
        </div>
      </div>

      <div className="table-data-note" role="note">
        <strong>One row per DEX version.</strong>
        Minswap Stable and duplicate protocol-total rows are hidden. Source details show native and DefiLlama values side by side; they are not averaged because their coverage and period definitions can differ. Versions without a public split remain unranked.
      </div>

      <div
        className="table-shell"
        role="region"
        aria-label="Scrollable DEX performance table with frozen headers"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th><SortableHeader label="Rank / DEX" field="name" {...headerProps} /></th>
              <th><SortableHeader label="DEX volume · 24h" field="volume24hUsd" {...headerProps} /></th>
              <th><SortableHeader label="7d volume" field="volume7dUsd" {...headerProps} /></th>
              <th><SortableHeader label="30d volume" field="volume30dUsd" {...headerProps} /></th>
              <th><SortableHeader label="Previous 7d" field="previous7dUsd" {...headerProps} /></th>
              <th><SortableHeader label="WoW" field="weekChangePct" {...headerProps} /></th>
              <th><SortableHeader label="Trades · 24h" field="trades24h" {...headerProps} /></th>
              <th><SortableHeader label="Users · 24h" field="users24h" {...headerProps} /></th>
              <th><SortableHeader label="DAU · 24h" field="dau24h" {...headerProps} /></th>
              <th><SortableHeader label="Fees · 24h" field="fees24hUsd" {...headerProps} /></th>
              <th><SortableHeader label="Fees · 7d" field="fees7dUsd" {...headerProps} /></th>
              <th><SortableHeader label="TVL" field="tvlUsd" {...headerProps} /></th>
              <th><SortableHeader label="Vol / TVL" field="volumeToTvl" {...headerProps} /></th>
              <th><SortableHeader label="Market cap" field="marketCapUsd" {...headerProps} /></th>
              <th><SortableHeader label="MCap / TVL" field="marketCapToTvl" {...headerProps} /></th>
              <th><SortableHeader label="Pools" field="poolCount" {...headerProps} /></th>
              <th><SortableHeader label="Share" field="marketShare24hPct" {...headerProps} /></th>
              <th><SortableHeader label="vs DefiLlama" field="variance24hPct" {...headerProps} /></th>
              <th>Last data</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((dex) => {
              const trend = dex.weekChangePct == null ? "neutral" : dex.weekChangePct > 0 ? "positive" : dex.weekChangePct < 0 ? "negative" : "neutral";
              const aggregateDetail = dex.parentId ? detailRows.get(dex.parentId) || null : dex;
              const aggregateQuality = aggregateDetail?.quality || dex.quality;
              const canExpand = dex.rowKind === "version" || aggregateQuality !== "aligned";
              const isExpanded = expandedRows.has(dex.id);
              return (
                <Fragment key={dex.id}>
                  <tr className={dex.rowKind === "version" ? "version-row" : "protocol-row"}>
                    <td>
                      <div className="dex-cell">
                        <span className="rank">{volumeRanks.has(dex.id) ? `#${volumeRanks.get(dex.id)}` : "–"}</span>
                        {dex.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={dex.logo} alt="" width={30} height={30} loading="lazy" />
                        ) : (
                          <span className="dex-fallback" style={{ background: dex.color }}>{dex.name.slice(0, 1)}</span>
                        )}
                        <div>
                          <strong>{dex.name}</strong>
                          <span className={`row-kind row-kind--${dex.rowKind}`}>
                            {dex.rowKind === "version" ? `${dex.protocolVersion} contract` : "DEX protocol"}
                          </span>
                          <span className="quality-stack">
                            <span className={`quality quality--${dex.quality}`}>{qualityLabels[dex.quality]}</span>
                            {aggregateDetail && aggregateDetail.id !== dex.id && aggregateDetail.quality !== dex.quality ? (
                              <span className={`quality quality--${aggregateDetail.quality}`}>Protocol {qualityLabels[aggregateDetail.quality]}</span>
                            ) : null}
                          </span>
                          {canExpand ? (
                            <button
                              type="button"
                              className="source-detail-toggle"
                              aria-expanded={isExpanded}
                              aria-controls={`source-detail-${dex.id}`}
                              onClick={() => toggleDetails(dex.id)}
                            >
                              {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                              Source details
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{formatMoney(dex.volume24hUsd, currency, adaPriceUsd)}</td>
                    <td>{formatMoney(dex.volume7dUsd, currency, adaPriceUsd)}</td>
                    <td>{formatMoney(dex.volume30dUsd, currency, adaPriceUsd)}</td>
                    <td>{formatMoney(dex.previous7dUsd, currency, adaPriceUsd)}</td>
                    <td><span className={`trend-text trend-text--${trend}`}>{formatPercent(dex.weekChangePct)}</span></td>
                    <td>{formatCount(dex.trades24h)}</td>
                    <td>{formatCount(dex.users24h)}</td>
                    <td>{formatCount(dex.dau24h)}</td>
                    <td>{formatMoney(dex.fees24hUsd, currency, adaPriceUsd)}</td>
                    <td>{formatMoney(dex.fees7dUsd, currency, adaPriceUsd)}</td>
                    <td>{formatMoney(dex.tvlUsd, currency, adaPriceUsd)}</td>
                    <td>{formatRatio(dex.volumeToTvl)}</td>
                    <td>{formatMoney(dex.marketCapUsd, currency, adaPriceUsd)}</td>
                    <td>{formatRatio(dex.marketCapToTvl)}</td>
                    <td>{formatCount(dex.poolCount)}</td>
                    <td>{formatPercent(dex.marketShare24hPct, false)}</td>
                    <td>
                      <span className={`variance variance--${dex.quality}`} title={`${dex.sourceLabel}. ${dex.periodNote}`}>
                        {formatPercent(dex.variance24hPct)}
                      </span>
                    </td>
                    <td>
                      <time dateTime={dex.lastDataAt || undefined}>{formatDateTime(dex.lastDataAt)}</time>
                      <small>{dex.sourceLabel}</small>
                    </td>
                  </tr>
                  {isExpanded && aggregateDetail ? (
                    <tr className="source-detail-row" id={`source-detail-${dex.id}`}>
                      <td colSpan={COLUMN_COUNT}>
                        <div className="source-detail-panel">
                          <article>
                            <span>{dex.rowKind === "version" ? "Version 24h" : "Displayed 24h"}</span>
                            <strong>{formatMoney(dex.volume24hUsd, currency, adaPriceUsd)}</strong>
                            <small>{dex.sourceLabel}</small>
                          </article>
                          <article>
                            <span>Protocol native total</span>
                            <strong>{formatMoney(aggregateDetail.nativeVolume24hUsd, currency, adaPriceUsd)}</strong>
                            <small>Aggregate context, never assigned to a version.</small>
                          </article>
                          <article>
                            <span>DefiLlama protocol total</span>
                            <strong>{formatMoney(aggregateDetail.defillamaVolume24hUsd, currency, adaPriceUsd)}</strong>
                            <small>Benchmark coverage can differ from the native API.</small>
                          </article>
                          <article>
                            <span>Protocol source variance</span>
                            <strong>{formatPercent(sourceVariance(aggregateDetail))}</strong>
                            <small>No arithmetic average is used.</small>
                          </article>
                          <p>{dex.periodNote} {dex.rowKind === "version" ? aggregateDetail.periodNote : ""}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? <div className="table-empty">No DEXes match the current filters.</div> : null}
      </div>
    </section>
  );
}
