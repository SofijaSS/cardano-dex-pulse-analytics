export type DataMode = "live" | "mock";

export type SourceHealth = "healthy" | "stale" | "error";

export type QualityFlag =
  | "aligned"
  | "material-variance"
  | "native-only"
  | "benchmark-only"
  | "unavailable";

export interface SourceStatus {
  id: string;
  label: string;
  endpoint: string;
  health: SourceHealth;
  fetchedAt: string;
  dataAt: string | null;
  expectedUpdateMinutes: number;
  message: string;
}

export interface PricePoint {
  usd: number | null;
  timestamp: string | null;
  source: string;
  endpoint: string;
}

export interface DexMetric {
  id: string;
  name: string;
  rowKind: "protocol" | "version";
  tableRole: "primary" | "detail" | "hidden";
  parentId: string | null;
  protocolVersion: string | null;
  logo: string | null;
  color: string;
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  volume30dUsd: number | null;
  previous7dUsd: number | null;
  weekChangePct: number | null;
  tvlUsd: number | null;
  volumeToTvl: number | null;
  marketShare24hPct: number | null;
  rank7d: number | null;
  trades24h: number | null;
  users24h: number | null;
  dau24h: number | null;
  fees24hUsd: number | null;
  fees7dUsd: number | null;
  marketCapUsd: number | null;
  marketCapToTvl: number | null;
  poolCount: number | null;
  nativeVolume24hUsd: number | null;
  defillamaVolume24hUsd: number | null;
  defillamaVolume7dUsd: number | null;
  defillamaVolume30dUsd: number | null;
  defillamaPrevious7dUsd: number | null;
  variance24hPct: number | null;
  quality: QualityFlag;
  sourceLabel: string;
  sourceUrl: string | null;
  periodNote: string;
  lastDataAt: string | null;
}

export interface VolumeSeriesPoint {
  timestamp: number;
  totalUsd: number;
  byDex: Record<string, number>;
}

export interface AggregateMetrics {
  observed24hUsd: number | null;
  observed7dUsd: number | null;
  observed30dUsd: number | null;
  observedTvlUsd: number | null;
  comparableWeekChangePct: number | null;
  comparableMonthChangePct: number | null;
  activeDexes: number;
  coverage24h: number;
  coverage7d: number;
  coverage30d: number;
  trackedDexes: number;
  benchmark24hUsd: number | null;
  benchmark7dUsd: number | null;
  benchmark30dUsd: number | null;
  benchmarkTvlUsd: number | null;
  benchmarkWeekChangePct: number | null;
  benchmarkMonthChangePct: number | null;
}

export interface DashboardData {
  schemaVersion: "1.0";
  mode: DataMode;
  generatedAt: string;
  price: PricePoint;
  aggregates: AggregateMetrics;
  dexes: DexMetric[];
  benchmarkSeries: VolumeSeriesPoint[];
  sources: SourceStatus[];
  warnings: string[];
}

export interface NativeDexSnapshot {
  id: string;
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  volume30dUsd: number | null;
  previous7dUsd: number | null;
  tvlUsd: number | null;
  trades24h?: number | null;
  users24h?: number | null;
  dau24h?: number | null;
  fees24hUsd?: number | null;
  fees7dUsd?: number | null;
  marketCapUsd?: number | null;
  poolCount?: number | null;
  sourceLabel: string;
  sourceUrl: string;
  periodNote: string;
  dataAt: string | null;
}
