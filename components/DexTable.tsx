"use client";

import { useDeferredValue, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
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
  | "tvlUsd"
  | "volumeToTvl"
  | "marketShare24hPct"
  | "variance24hPct";

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
  const [sortKey, setSortKey] = useState<SortKey>("volume7dUsd");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: SortKey) => {
    if (field === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setDirection(field === "name" ? "asc" : "desc");
    }
  };

  const filtered = dexes
    .filter((dex) => {
      const matchesQuery = `${dex.name} ${dex.sourceLabel}`
        .toLowerCase()
        .includes(deferredQuery.trim().toLowerCase());
      return matchesQuery && (quality === "all" || dex.quality === quality);
    })
    .sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b)
          : Number(a) - Number(b);
      return direction === "asc" ? comparison : -comparison;
    });

  const headerProps = { sortKey, direction, onSort: handleSort };

  return (
    <section className="table-section" id="dex-table">
      <div className="section-heading table-heading">
        <div>
          <span className="eyebrow">Exchange detail</span>
          <h2>DEX performance table</h2>
          <p>Every numeric column is sortable. Source quality is evaluated against the current DefiLlama benchmark.</p>
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

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th><SortableHeader label="Rank / DEX" field="rank7d" {...headerProps} /></th>
              <th><SortableHeader label="24h volume" field="volume24hUsd" {...headerProps} /></th>
              <th><SortableHeader label="7d volume" field="volume7dUsd" {...headerProps} /></th>
              <th><SortableHeader label="30d volume" field="volume30dUsd" {...headerProps} /></th>
              <th><SortableHeader label="Previous 7d" field="previous7dUsd" {...headerProps} /></th>
              <th><SortableHeader label="WoW" field="weekChangePct" {...headerProps} /></th>
              <th><SortableHeader label="TVL" field="tvlUsd" {...headerProps} /></th>
              <th><SortableHeader label="Vol / TVL" field="volumeToTvl" {...headerProps} /></th>
              <th><SortableHeader label="Share" field="marketShare24hPct" {...headerProps} /></th>
              <th><SortableHeader label="vs DefiLlama" field="variance24hPct" {...headerProps} /></th>
              <th>Last data</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((dex) => {
              const trend = dex.weekChangePct == null ? "neutral" : dex.weekChangePct > 0 ? "positive" : dex.weekChangePct < 0 ? "negative" : "neutral";
              return (
                <tr key={dex.id}>
                  <td>
                    <div className="dex-cell">
                      <span className="rank">{dex.rank7d ? `#${dex.rank7d}` : "–"}</span>
                      {dex.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={dex.logo} alt="" width={30} height={30} loading="lazy" />
                      ) : (
                        <span className="dex-fallback" style={{ background: dex.color }}>{dex.name.slice(0, 1)}</span>
                      )}
                      <div>
                        <strong>{dex.name}</strong>
                        <span className={`quality quality--${dex.quality}`}>{qualityLabels[dex.quality]}</span>
                      </div>
                    </div>
                  </td>
                  <td>{formatMoney(dex.volume24hUsd, currency, adaPriceUsd)}</td>
                  <td>{formatMoney(dex.volume7dUsd, currency, adaPriceUsd)}</td>
                  <td>{formatMoney(dex.volume30dUsd, currency, adaPriceUsd)}</td>
                  <td>{formatMoney(dex.previous7dUsd, currency, adaPriceUsd)}</td>
                  <td><span className={`trend-text trend-text--${trend}`}>{formatPercent(dex.weekChangePct)}</span></td>
                  <td>{formatMoney(dex.tvlUsd, currency, adaPriceUsd)}</td>
                  <td>{formatRatio(dex.volumeToTvl)}</td>
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
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? <div className="table-empty">No DEXes match the current filters.</div> : null}
      </div>
    </section>
  );
}
