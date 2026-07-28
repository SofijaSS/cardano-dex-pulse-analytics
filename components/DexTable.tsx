"use client";

import {
  Fragment,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatRatio,
  type Currency,
} from "@/lib/format";
import { PreserveTerms } from "@/components/PreserveTerms";
import { copyTableAsPng, selectTablePngRows } from "@/lib/table-png";
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

export type DexTableColumnKey =
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
  | "variance24hPct"
  | "lastData";

type ColumnDefinition = {
  key: DexTableColumnKey;
  label: string;
  group: "Volume" | "Activity" | "Value" | "Reporting";
  sortKey?: SortKey;
  width: number;
};

export const DEX_TABLE_COLUMNS: ColumnDefinition[] = [
  { key: "volume7dUsd", label: "DEX volume · 7d", group: "Volume", sortKey: "volume7dUsd", width: 102 },
  { key: "volume24hUsd", label: "24h volume", group: "Volume", sortKey: "volume24hUsd", width: 98 },
  { key: "volume30dUsd", label: "30d volume", group: "Volume", sortKey: "volume30dUsd", width: 98 },
  { key: "previous7dUsd", label: "Previous 7d", group: "Volume", sortKey: "previous7dUsd", width: 102 },
  { key: "weekChangePct", label: "WoW change", group: "Volume", sortKey: "weekChangePct", width: 76 },
  { key: "tvlUsd", label: "TVL", group: "Value", sortKey: "tvlUsd", width: 96 },
  { key: "volumeToTvl", label: "Volume / TVL", group: "Value", sortKey: "volumeToTvl", width: 84 },
  { key: "trades24h", label: "Trades · 24h", group: "Activity", sortKey: "trades24h", width: 84 },
  { key: "users24h", label: "Users · 24h", group: "Activity", sortKey: "users24h", width: 82 },
  { key: "dau24h", label: "DAU · 24h", group: "Activity", sortKey: "dau24h", width: 76 },
  { key: "fees24hUsd", label: "Fees · 24h", group: "Activity", sortKey: "fees24hUsd", width: 94 },
  { key: "fees7dUsd", label: "Fees · 7d", group: "Activity", sortKey: "fees7dUsd", width: 92 },
  { key: "marketCapUsd", label: "Market cap", group: "Value", sortKey: "marketCapUsd", width: 100 },
  { key: "marketCapToTvl", label: "Market cap / TVL", group: "Value", sortKey: "marketCapToTvl", width: 96 },
  { key: "poolCount", label: "Pools", group: "Value", sortKey: "poolCount", width: 66 },
  { key: "marketShare24hPct", label: "Market share", group: "Reporting", sortKey: "marketShare24hPct", width: 80 },
  { key: "variance24hPct", label: "vs DefiLlama", group: "Reporting", sortKey: "variance24hPct", width: 90 },
  { key: "lastData", label: "Last data", group: "Reporting", width: 118 },
];

const ALL_COLUMN_KEYS = DEX_TABLE_COLUMNS.map((column) => column.key);
const COLUMN_PREFERENCE_KEY = "cardano-dex-pulse:table-columns";
const COLUMN_PREFERENCE_EVENT = `${COLUMN_PREFERENCE_KEY}:changed`;
const DEFAULT_COLUMN_PREFERENCE = JSON.stringify(ALL_COLUMN_KEYS);
let memoryColumnPreference = DEFAULT_COLUMN_PREFERENCE;
const SEVEN_DAY_COLUMN_KEYS: DexTableColumnKey[] = [
  "volume7dUsd",
  "previous7dUsd",
  "weekChangePct",
];

function readColumnPreference() {
  if (typeof window === "undefined") return DEFAULT_COLUMN_PREFERENCE;
  try {
    const stored = window.localStorage.getItem(COLUMN_PREFERENCE_KEY);
    if (!stored) {
      memoryColumnPreference = DEFAULT_COLUMN_PREFERENCE;
      return memoryColumnPreference;
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_COLUMN_PREFERENCE;
    memoryColumnPreference = JSON.stringify(
      parsed.filter(
        (key): key is DexTableColumnKey =>
          typeof key === "string" &&
          ALL_COLUMN_KEYS.includes(key as DexTableColumnKey),
      ),
    );
    return memoryColumnPreference;
  } catch {
    return memoryColumnPreference;
  }
}

function subscribeToColumnPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === COLUMN_PREFERENCE_KEY) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(COLUMN_PREFERENCE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(COLUMN_PREFERENCE_EVENT, onStoreChange);
  };
}

function storeColumnPreference(columns: Set<DexTableColumnKey>) {
  memoryColumnPreference = JSON.stringify(
    ALL_COLUMN_KEYS.filter((key) => columns.has(key)),
  );
  try {
    window.localStorage.setItem(COLUMN_PREFERENCE_KEY, memoryColumnPreference);
  } catch {
    // The custom event still keeps the selection active in the current tab.
  }
  window.dispatchEvent(new Event(COLUMN_PREFERENCE_EVENT));
}

function formatCount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatTablePercent(value: number | null | undefined, signed = true) {
  return value == null || !Number.isFinite(value)
    ? "n/a"
    : formatPercent(value, signed);
}

function formatTableRatio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "n/a" : formatRatio(value);
}

function formatTableDateTime(value: string | null | undefined) {
  if (!value) return "n/a";
  const formatted = formatDateTime(value);
  return formatted === "Data unavailable" ? "n/a" : formatted;
}

function sourceVariance(row: DexMetric) {
  const native = row.nativeVolume24hUsd;
  const benchmark = row.defillamaVolume24hUsd;
  if (native == null || benchmark == null || benchmark === 0) return null;
  return ((native - benchmark) / benchmark) * 100;
}

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
      <PreserveTerms>{label}</PreserveTerms>
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

const qualityOptions: Array<{ value: "all" | QualityFlag; label: string }> = [
  { value: "all", label: "All quality states" },
  ...Object.entries(qualityLabels).map(([value, label]) => ({
    value: value as QualityFlag,
    label,
  })),
];

export function DexTable({
  dexes,
  currency,
  adaPriceUsd,
  onExport,
}: {
  dexes: DexMetric[];
  currency: Currency;
  adaPriceUsd: number | null;
  onExport: (rows: DexMetric[], columns: DexTableColumnKey[]) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [quality, setQuality] = useState<"all" | QualityFlag>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume7dUsd");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const storedColumnPreference = useSyncExternalStore(
    subscribeToColumnPreference,
    readColumnPreference,
    () => DEFAULT_COLUMN_PREFERENCE,
  );
  const visibleColumns = new Set<DexTableColumnKey>(
    JSON.parse(storedColumnPreference) as DexTableColumnKey[],
  );
  const [draftColumns, setDraftColumns] = useState<Set<DexTableColumnKey>>(
    () => new Set(ALL_COLUMN_KEYS),
  );
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [pngStatus, setPngStatus] = useState<
    "idle" | "working" | "copied" | "downloaded" | "error"
  >("idle");
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const qualityPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOpenMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!columnPickerRef.current?.contains(target)) setColumnPickerOpen(false);
      if (!qualityPickerRef.current?.contains(target)) setQualityPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setColumnPickerOpen(false);
      setQualityPickerOpen(false);
    };

    document.addEventListener("pointerdown", closeOpenMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOpenMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const fallbackSortKey = DEX_TABLE_COLUMNS.find(
    (column) => visibleColumns.has(column.key) && column.sortKey,
  )?.sortKey;
  const activeSortKey =
    sortKey === "name" || visibleColumns.has(sortKey as DexTableColumnKey)
      ? sortKey
      : fallbackSortKey || "name";
  const activeDirection =
    activeSortKey === sortKey
      ? direction
      : activeSortKey === "name" ? "asc" : "desc";

  const handleSort = (field: SortKey) => {
    if (field === activeSortKey) {
      setSortKey(field);
      setDirection(activeDirection === "asc" ? "desc" : "asc");
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
      .filter((dex) => dex.volume7dUsd != null)
      .sort((left, right) =>
        (right.volume7dUsd || 0) - (left.volume7dUsd || 0) ||
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
      const a = left[activeSortKey];
      const b = right[activeSortKey];
      if (a == null && b == null) return left.name.localeCompare(right.name);
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b)
          : Number(a) - Number(b);
      if (comparison === 0) return left.name.localeCompare(right.name);
      return activeDirection === "asc" ? comparison : -comparison;
    });

  const toggleDetails = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyVisibleColumns = (next: Set<DexTableColumnKey>) => {
    if (activeSortKey === "name" || next.has(activeSortKey as DexTableColumnKey)) {
      if (sortKey !== activeSortKey) setSortKey(activeSortKey);
      return;
    }

    const fallback = DEX_TABLE_COLUMNS.find(
      (column) => next.has(column.key) && column.sortKey,
    )?.sortKey;
    setSortKey(fallback || "name");
    setDirection(fallback ? "desc" : "asc");
  };

  const toggleDraftColumn = (key: DexTableColumnKey) => {
    const next = new Set(draftColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraftColumns(next);
  };

  const openColumnPicker = () => {
    if (!columnPickerOpen) setDraftColumns(new Set(visibleColumns));
    setColumnPickerOpen((current) => !current);
    setQualityPickerOpen(false);
  };

  const saveColumnSelection = () => {
    applyVisibleColumns(draftColumns);
    storeColumnPreference(draftColumns);
    setColumnPickerOpen(false);
  };

  const visibleColumnKeys = ALL_COLUMN_KEYS.filter((key) => visibleColumns.has(key));
  const visibleColumnCount = visibleColumnKeys.length;
  const draftColumnCount = ALL_COLUMN_KEYS.filter((key) => draftColumns.has(key)).length;
  const tableMinWidth = Math.max(
    560,
    196 + DEX_TABLE_COLUMNS.reduce(
      (width, column) => width + (visibleColumns.has(column.key) ? column.width : 0),
      0,
    ),
  );
  const showColumn = (key: DexTableColumnKey) => visibleColumns.has(key);
  const moneyValue = (value: number | null) =>
    value == null || !Number.isFinite(value)
      ? "n/a"
      : formatMoney(value, currency, adaPriceUsd);
  const moneyText = (value: number | null) => (
    <PreserveTerms>{moneyValue(value)}</PreserveTerms>
  );

  const pngCellValue = (dex: DexMetric, key: DexTableColumnKey) => {
    switch (key) {
      case "volume24hUsd":
      case "volume7dUsd":
      case "volume30dUsd":
      case "previous7dUsd":
      case "fees24hUsd":
      case "fees7dUsd":
      case "tvlUsd":
      case "marketCapUsd":
        return moneyValue(dex[key]);
      case "weekChangePct":
        return formatTablePercent(dex.weekChangePct);
      case "volumeToTvl":
        return formatTableRatio(dex.volumeToTvl);
      case "trades24h":
      case "users24h":
      case "dau24h":
      case "poolCount":
        return formatCount(dex[key]);
      case "marketCapToTvl":
        return formatTableRatio(dex.marketCapToTvl);
      case "marketShare24hPct":
        return formatTablePercent(dex.marketShare24hPct, false);
      case "variance24hPct":
        return formatTablePercent(dex.variance24hPct);
      case "lastData":
        return `${formatTableDateTime(dex.lastDataAt)} · ${dex.sourceLabel}`;
    }
  };

  const copyCurrentTablePng = async () => {
    setPngStatus("working");
    try {
      const pngDexes = selectTablePngRows(filtered);
      const result = await copyTableAsPng({
        filename: `cardano-dex-performance-${new Date().toISOString().slice(0, 10)}.png`,
        title: "DEX performance table",
        subtitle: `${pngDexes.length} top rows · ${visibleColumnCount} visible metrics · ${currency} · current filters and sorting`,
        headers: [
          "7D rank / DEX",
          ...visibleColumnKeys.map(
            (key) => DEX_TABLE_COLUMNS.find((column) => column.key === key)?.label || key,
          ),
        ],
        rows: pngDexes.map((dex) => ({
          accentColor: dex.color,
          cells: [
            `${volumeRanks.has(dex.id) ? `#${volumeRanks.get(dex.id)}` : "–"} ${dex.name} · ${dex.rowKind === "version" ? dex.protocolVersion : "DEX"} · ${qualityLabels[dex.quality]}`,
            ...visibleColumnKeys.map((key) => pngCellValue(dex, key)),
          ],
        })),
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      });
      setPngStatus(result);
    } catch {
      setPngStatus("error");
    }
    window.setTimeout(() => setPngStatus("idle"), 2_400);
  };

  const pngStatusLabel = pngStatus === "working"
    ? "Preparing PNG"
    : pngStatus === "copied"
      ? "PNG copied"
      : pngStatus === "downloaded"
        ? "PNG downloaded"
        : pngStatus === "error"
          ? "Copy failed"
          : "Copy current table as PNG";

  const headerProps = {
    sortKey: activeSortKey,
    direction: activeDirection,
    onSort: handleSort,
  };

  return (
    <section className="table-section" id="dex-table">
      <div className="section-heading table-heading">
        <div>
          <span className="eyebrow">Exchange detail</span>
          <h2>DEX performance table</h2>
          <p>Individual DEX versions ranked by 7-day volume. Protocol totals stay inside source details.</p>
        </div>
        <div className="table-actions">
          <div className="table-search-actions">
            <div className="table-copy-control">
              <button
                type="button"
                className={`table-copy-button table-copy-button--${pngStatus}`}
                aria-label="Copy current DEX performance table as PNG"
                title={pngStatusLabel}
                disabled={pngStatus === "working"}
                onClick={copyCurrentTablePng}
              >
                {pngStatus === "copied" || pngStatus === "downloaded"
                  ? <Check size={16} aria-hidden="true" />
                  : <Camera size={16} aria-hidden="true" />}
              </button>
              {pngStatus !== "idle" ? (
                <span className="table-copy-status" role="status">{pngStatusLabel}</span>
              ) : null}
            </div>
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Filter DEXes</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter DEXes" />
            </label>
          </div>
          <div className="select-field" ref={qualityPickerRef}>
            <button
              type="button"
              className="select-field__trigger"
              aria-label="Filter by source quality"
              aria-haspopup="listbox"
              aria-expanded={qualityPickerOpen}
              onClick={() => {
                setQualityPickerOpen((current) => !current);
                setColumnPickerOpen(false);
              }}
            >
              <span>{qualityOptions.find((option) => option.value === quality)?.label}</span>
              <ChevronDown className="dropdown-chevron" size={15} aria-hidden="true" />
            </button>
            {qualityPickerOpen ? (
              <div className="select-field__menu" role="listbox" aria-label="Source quality">
                {qualityOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={quality === option.value ? "is-selected" : ""}
                    role="option"
                    aria-selected={quality === option.value}
                    onClick={() => {
                      setQuality(option.value);
                      setQualityPickerOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div
            className={columnPickerOpen ? "column-picker is-open" : "column-picker"}
            ref={columnPickerRef}
          >
            <button
              type="button"
              className="column-picker__trigger"
              aria-haspopup="dialog"
              aria-expanded={columnPickerOpen}
              onClick={openColumnPicker}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              Columns
              <span>{visibleColumnCount}/{DEX_TABLE_COLUMNS.length}</span>
              <ChevronDown className="dropdown-chevron" size={15} aria-hidden="true" />
            </button>
            {columnPickerOpen ? <div className="column-picker__menu" role="dialog" aria-label="Customize table columns">
              <div className="column-picker__heading">
                <div>
                  <strong>Customize table</strong>
                  <small>Rank / DEX is always visible.</small>
                </div>
                <span>{draftColumnCount} shown</span>
              </div>
              <div className="column-picker__actions" aria-label="Column presets">
                <button type="button" onClick={() => setDraftColumns(new Set(ALL_COLUMN_KEYS))}>Show all</button>
                <button type="button" onClick={() => setDraftColumns(new Set(SEVEN_DAY_COLUMN_KEYS))}>7D focus</button>
                <button type="button" onClick={() => setDraftColumns(new Set())}>Clear metrics</button>
              </div>
              {["Volume", "Activity", "Value", "Reporting"].map((group) => (
                <fieldset key={group}>
                  <legend>{group}</legend>
                  <div className="column-picker__options">
                    {DEX_TABLE_COLUMNS.filter((column) => column.group === group).map((column) => (
                      <label key={column.key}>
                        <input
                          type="checkbox"
                          checked={draftColumns.has(column.key)}
                          onChange={() => toggleDraftColumn(column.key)}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="column-picker__footer">
                <button type="button" className="button button--primary" onClick={saveColumnSelection}>
                  Save
                </button>
              </div>
            </div> : null}
          </div>
          <button type="button" className="button button--secondary" onClick={() => onExport(filtered, visibleColumnKeys)}>
            <Download size={15} aria-hidden="true" />
            Export table
          </button>
        </div>
      </div>

      <div
        className="table-shell"
        role="region"
        aria-label="Scrollable DEX performance table with frozen headers"
        tabIndex={0}
      >
        <table style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr>
              <th><SortableHeader label="7D rank / DEX" field="volume7dUsd" {...headerProps} /></th>
              {showColumn("volume7dUsd") ? <th><SortableHeader label="DEX volume · 7d" field="volume7dUsd" {...headerProps} /></th> : null}
              {showColumn("volume24hUsd") ? <th><SortableHeader label="24h volume" field="volume24hUsd" {...headerProps} /></th> : null}
              {showColumn("volume30dUsd") ? <th><SortableHeader label="30d volume" field="volume30dUsd" {...headerProps} /></th> : null}
              {showColumn("previous7dUsd") ? <th><SortableHeader label="Previous 7d" field="previous7dUsd" {...headerProps} /></th> : null}
              {showColumn("weekChangePct") ? <th><SortableHeader label="WoW" field="weekChangePct" {...headerProps} /></th> : null}
              {showColumn("tvlUsd") ? <th><SortableHeader label="TVL" field="tvlUsd" {...headerProps} /></th> : null}
              {showColumn("volumeToTvl") ? <th><SortableHeader label="Vol / TVL" field="volumeToTvl" {...headerProps} /></th> : null}
              {showColumn("trades24h") ? <th><SortableHeader label="Trades · 24h" field="trades24h" {...headerProps} /></th> : null}
              {showColumn("users24h") ? <th><SortableHeader label="Users · 24h" field="users24h" {...headerProps} /></th> : null}
              {showColumn("dau24h") ? <th><SortableHeader label="DAU · 24h" field="dau24h" {...headerProps} /></th> : null}
              {showColumn("fees24hUsd") ? <th><SortableHeader label="Fees · 24h" field="fees24hUsd" {...headerProps} /></th> : null}
              {showColumn("fees7dUsd") ? <th><SortableHeader label="Fees · 7d" field="fees7dUsd" {...headerProps} /></th> : null}
              {showColumn("marketCapUsd") ? <th><SortableHeader label="Market cap" field="marketCapUsd" {...headerProps} /></th> : null}
              {showColumn("marketCapToTvl") ? <th><SortableHeader label="MCap / TVL" field="marketCapToTvl" {...headerProps} /></th> : null}
              {showColumn("poolCount") ? <th><SortableHeader label="Pools" field="poolCount" {...headerProps} /></th> : null}
              {showColumn("marketShare24hPct") ? <th><SortableHeader label="Share" field="marketShare24hPct" {...headerProps} /></th> : null}
              {showColumn("variance24hPct") ? <th><SortableHeader label="vs DefiLlama" field="variance24hPct" {...headerProps} /></th> : null}
              {showColumn("lastData") ? <th>Last data</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((dex, rowIndex) => {
              const trend = dex.weekChangePct == null ? "neutral" : dex.weekChangePct > 0 ? "positive" : dex.weekChangePct < 0 ? "negative" : "neutral";
              const aggregateDetail = dex.parentId ? detailRows.get(dex.parentId) || null : dex;
              const aggregateQuality = aggregateDetail?.quality || dex.quality;
              const canExpand = dex.rowKind === "version" || aggregateQuality !== "aligned";
              const isExpanded = expandedRows.has(dex.id);
              return (
                <Fragment key={dex.id}>
                  <tr className={`${dex.rowKind === "version" ? "version-row" : "protocol-row"}${rowIndex % 2 === 1 ? " table-row--alternate" : ""}`}>
                    <td>
                      <div className="dex-cell">
                        <span className="rank">{volumeRanks.has(dex.id) ? `#${volumeRanks.get(dex.id)}` : "–"}</span>
                        <div className="dex-identity">
                          {dex.logo ? (
                            <span className={`dex-logo-frame${dex.logo.endsWith("/wingriders-v2.png") ? " dex-logo-frame--wingriders" : ""}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={dex.logo} alt="" width={28} height={28} loading="lazy" />
                            </span>
                          ) : (
                            <span className="dex-fallback" style={{ background: dex.color }}>{dex.name.slice(0, 1)}</span>
                          )}
                          <div className="dex-copy">
                            <div className="dex-name-line">
                              <strong><PreserveTerms>{dex.name}</PreserveTerms></strong>
                            </div>
                            <div className="dex-meta-line">
                              <span
                                className={`quality quality--${dex.quality}`}
                                title={qualityLabels[dex.quality]}
                                aria-label={`Source quality: ${qualityLabels[dex.quality]}`}
                              >
                                {qualityLabels[dex.quality]}
                              </span>
                              <span className={`row-kind row-kind--${dex.rowKind}`}>
                                {dex.rowKind === "version" ? dex.protocolVersion : "DEX"}
                              </span>
                              {canExpand ? (
                                <button
                                  type="button"
                                  className="source-detail-toggle"
                                  aria-expanded={isExpanded}
                                  aria-controls={`source-detail-${dex.id}`}
                                  onClick={() => toggleDetails(dex.id)}
                                >
                                  {isExpanded ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronRight size={11} aria-hidden="true" />}
                                  Details
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    {showColumn("volume7dUsd") ? <td>{moneyText(dex.volume7dUsd)}</td> : null}
                    {showColumn("volume24hUsd") ? <td>{moneyText(dex.volume24hUsd)}</td> : null}
                    {showColumn("volume30dUsd") ? <td>{moneyText(dex.volume30dUsd)}</td> : null}
                    {showColumn("previous7dUsd") ? <td>{moneyText(dex.previous7dUsd)}</td> : null}
                    {showColumn("weekChangePct") ? <td><span className={`trend-text trend-text--${trend}`}>{formatTablePercent(dex.weekChangePct)}</span></td> : null}
                    {showColumn("tvlUsd") ? <td>{moneyText(dex.tvlUsd)}</td> : null}
                    {showColumn("volumeToTvl") ? <td>{formatTableRatio(dex.volumeToTvl)}</td> : null}
                    {showColumn("trades24h") ? <td>{formatCount(dex.trades24h)}</td> : null}
                    {showColumn("users24h") ? <td>{formatCount(dex.users24h)}</td> : null}
                    {showColumn("dau24h") ? <td>{formatCount(dex.dau24h)}</td> : null}
                    {showColumn("fees24hUsd") ? <td>{moneyText(dex.fees24hUsd)}</td> : null}
                    {showColumn("fees7dUsd") ? <td>{moneyText(dex.fees7dUsd)}</td> : null}
                    {showColumn("marketCapUsd") ? <td>{moneyText(dex.marketCapUsd)}</td> : null}
                    {showColumn("marketCapToTvl") ? <td>{formatTableRatio(dex.marketCapToTvl)}</td> : null}
                    {showColumn("poolCount") ? <td>{formatCount(dex.poolCount)}</td> : null}
                    {showColumn("marketShare24hPct") ? <td>{formatTablePercent(dex.marketShare24hPct, false)}</td> : null}
                    {showColumn("variance24hPct") ? <td>
                      <span className={`variance variance--${dex.quality}`} title={`${dex.sourceLabel}. ${dex.periodNote}`}>
                        {formatTablePercent(dex.variance24hPct)}
                      </span>
                    </td> : null}
                    {showColumn("lastData") ? <td>
                      <time dateTime={dex.lastDataAt || undefined}>{formatTableDateTime(dex.lastDataAt)}</time>
                      <small><PreserveTerms>{dex.sourceLabel}</PreserveTerms></small>
                    </td> : null}
                  </tr>
                  {isExpanded && aggregateDetail ? (
                    <tr className="source-detail-row" id={`source-detail-${dex.id}`}>
                      <td colSpan={visibleColumnCount + 1}>
                        <div className="source-detail-panel">
                          <article>
                            <span>{dex.rowKind === "version" ? "Version 24h" : "Displayed 24h"}</span>
                            <strong>{moneyText(dex.volume24hUsd)}</strong>
                            <small><PreserveTerms>{dex.sourceLabel}</PreserveTerms></small>
                          </article>
                          <article>
                            <span>Protocol native total</span>
                            <strong>{moneyText(aggregateDetail.nativeVolume24hUsd)}</strong>
                            <small>Aggregate context, never assigned to a version.</small>
                          </article>
                          <article>
                            <span><PreserveTerms>DefiLlama protocol total</PreserveTerms></span>
                            <strong>{moneyText(aggregateDetail.defillamaVolume24hUsd)}</strong>
                            <small><PreserveTerms>Benchmark coverage can differ from the native API.</PreserveTerms></small>
                          </article>
                          <article>
                            <span>Protocol source variance</span>
                            <strong>{formatTablePercent(sourceVariance(aggregateDetail))}</strong>
                            <small>No arithmetic average is used.</small>
                          </article>
                          <p><PreserveTerms>{`${dex.periodNote} ${dex.rowKind === "version" ? aggregateDetail.periodNote : ""}`}</PreserveTerms></p>
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
