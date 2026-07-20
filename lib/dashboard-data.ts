import { z } from "zod";
import {
  DEX_REGISTRY,
  DEX_VERSION_REGISTRY,
  normalizeName,
  slugify,
  type DexConfig,
} from "@/config/dexes";
import {
  classifySourceQuality,
  safeDivide,
  safePercentChange,
  sumAvailable,
  validateUsdAdaPair,
  variancePct,
} from "@/lib/calculations";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";
import { summarizeMinswapVersion } from "@/lib/protocol-versions";
import type {
  DashboardData,
  DexMetric,
  NativeDexSnapshot,
  QualityFlag,
  SourceStatus,
  VolumeSeriesPoint,
} from "@/lib/types";

const nullableNumber = z.number().finite().nullable().optional();

const volumeProtocolSchema = z
  .object({
    name: z.string(),
    total24h: nullableNumber,
    total7d: nullableNumber,
    total30d: nullableNumber,
    total14dto7d: nullableNumber,
    total60dto30d: nullableNumber,
  })
  .passthrough();

const defillamaOverviewSchema = z
  .object({
    total24h: nullableNumber,
    total7d: nullableNumber,
    total30d: nullableNumber,
    total14dto7d: nullableNumber,
    total60dto30d: nullableNumber,
    protocols: z.array(volumeProtocolSchema),
    totalDataChart: z.array(z.tuple([z.number(), z.number()])),
    totalDataChartBreakdown: z.array(
      z.tuple([z.number(), z.record(z.string(), z.number())]),
    ),
  })
  .passthrough();

const defillamaProtocolSchema = z
  .object({
    name: z.string(),
    category: z.string().nullable().optional(),
    chains: z.array(z.string()).default([]),
    tvl: nullableNumber,
    chainTvls: z.record(z.string(), z.number()).optional(),
    logo: z.string().nullable().optional(),
  })
  .passthrough();

const defillamaProtocolsSchema = z.array(defillamaProtocolSchema);

const minswapSchema = z.object({
  pool_metrics: z.array(
    z
      .object({
        type: z.string(),
        volume_24h: nullableNumber,
        volume_7d: nullableNumber,
        trading_fee_24h: nullableNumber,
        trading_fee_7d: nullableNumber,
        liquidity_currency: nullableNumber,
      })
      .passthrough(),
  ),
});

const coinGeckoSchema = z.object({
  cardano: z.object({
    usd: z.number().positive(),
    last_updated_at: z.number().int().positive(),
  }),
});

const coinbaseSchema = z.object({
  data: z.object({
    amount: z.string(),
    base: z.literal("ADA"),
    currency: z.literal("USD"),
  }),
});

const wingridersMetricSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value >= 0, {
    message: "WingRiders metric must be a finite non-negative number.",
  });

const wingridersSchema = z.object({
  dailyVolume: wingridersMetricSchema,
  dailyFees: wingridersMetricSchema,
});

export function parseWingRidersPayload(payload: unknown) {
  return wingridersSchema.parse(payload);
}

const sundaeswapSchema = z.object({
  data: z.object({
    protocols: z.array(z.object({ version: z.string() })),
    stats: z.object({
      poolCount: z.number().int().nonnegative(),
      volume: z.object({
        asset: z.object({ id: z.string() }),
        quantity: z.string(),
      }),
    }),
  }),
});

const splashSchema = z.object({
  tvlUsd: z.string(),
  volumeUsd: z.string(),
});

const muesliVolumeSchema = z.record(z.string(), z.number());
const muesliTvlSchema = z.array(
  z.object({ date: z.string(), tvl: z.number().finite() }),
);

const vyfinanceSchema = z.object({
  allPoolsAnalytics: z.object({
    tvl: z.number().finite(),
    volume24H: z.number().finite(),
    volume48H: z.number().finite(),
    volume7D: z.number().finite(),
    volume14D: z.number().finite(),
  }),
});

const danoSchema = z.object({
  data: z.object({ dailyVolumeAdaValue: z.string() }),
});

const deltaSchema = z.object({ volume_usd: z.number().finite() });
const saturnSchema = z.object({
  volume: z.object({ volume: z.number().finite() }),
});

type DefillamaOverview = z.infer<typeof defillamaOverviewSchema>;
type DefillamaProtocol = z.infer<typeof defillamaProtocolSchema>;

interface Captured<T> {
  data: T | null;
  status: SourceStatus;
}

async function capture<T>({
  id,
  label,
  endpoint,
  expectedUpdateMinutes,
  load,
  dataAt,
}: {
  id: string;
  label: string;
  endpoint: string;
  expectedUpdateMinutes: number;
  load: () => Promise<T>;
  dataAt?: (data: T) => string | null;
}): Promise<Captured<T>> {
  const fetchedAt = new Date().toISOString();

  try {
    const data = await load();
    const observedAt = dataAt?.(data) || fetchedAt;
    const age = Date.now() - new Date(observedAt).getTime();
    const stale = age > expectedUpdateMinutes * 60_000;

    return {
      data,
      status: {
        id,
        label,
        endpoint,
        health: stale ? "stale" : "healthy",
        fetchedAt,
        dataAt: observedAt,
        expectedUpdateMinutes,
        message: stale
          ? "The latest provider timestamp is older than the expected update interval."
          : "Source responded successfully.",
      },
    };
  } catch (error) {
    return {
      data: null,
      status: {
        id,
        label,
        endpoint,
        health: "error",
        fetchedAt,
        dataAt: null,
        expectedUpdateMinutes,
        message: error instanceof Error ? error.message : "Source request failed.",
      },
    };
  }
}

function latestCompleteDayStart(now = Date.now()) {
  return Math.floor(now / 86_400_000) * 86_400_000 - 86_400_000;
}

function timestampParam(url: string, timestamp: number) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}timestamp=${Math.floor(timestamp / 1000)}`;
}

function sumField(
  rows: Array<Record<string, unknown>>,
  key: "volume_24h" | "volume_7d",
) {
  return rows.reduce((sum, row) => {
    const value = Number(row[key]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

type MinswapMetric = z.infer<typeof minswapSchema>["pool_metrics"][number];

function sumMinswapField(
  rows: MinswapMetric[],
  key:
    | "volume_24h"
    | "volume_7d"
    | "trading_fee_24h"
    | "trading_fee_7d"
    | "liquidity_currency",
) {
  return sumAvailable(rows.map((row) => row[key] ?? null));
}

function adaToUsd(valueAda: number | null, price: number | null) {
  if (valueAda == null || price == null) return null;
  const result = valueAda * price;
  return Number.isFinite(result) ? result : null;
}

function sumPeriod(
  record: Record<string, number>,
  startSeconds: number,
  endSeconds: number,
) {
  return Object.entries(record).reduce((sum, [timestamp, value]) => {
    const time = Number(timestamp);
    return time >= startSeconds && time < endSeconds ? sum + value : sum;
  }, 0);
}

function addDynamicDexes(
  protocols: DefillamaProtocol[],
  overview: DefillamaOverview | null,
) {
  const claimed = new Set(
    [
      ...DEX_REGISTRY.flatMap((dex) => [
        dex.name,
        ...dex.volumeAliases,
        ...dex.tvlAliases,
      ]),
      ...DEX_VERSION_REGISTRY.map((version) => version.name),
    ].map(normalizeName),
  );
  const colors = ["#617a89", "#8b6f47", "#3d7f78", "#9a5b63", "#6f6a9a"];
  const candidates = new Map<string, string>();

  for (const protocol of protocols) {
    if (
      protocol.category === "Dexs" &&
      protocol.chains.includes("Cardano")
    ) {
      candidates.set(normalizeName(protocol.name), protocol.name);
    }
  }
  for (const protocol of overview?.protocols || []) {
    candidates.set(normalizeName(protocol.name), protocol.name);
  }

  return [...candidates.entries()]
    .filter(([normalized]) => !claimed.has(normalized))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right))
    .map<DexConfig>((name, index) => ({
      id: slugify(name),
      name,
      color: colors[index % colors.length],
      volumeAliases: [name],
      tvlAliases: [name],
      required: false,
    }));
}

function getDefillamaMetric(
  overview: DefillamaOverview | null,
  aliases: string[],
  field:
    | "total24h"
    | "total7d"
    | "total30d"
    | "total14dto7d"
    | "total60dto30d",
) {
  if (!overview || !aliases.length) return null;
  const names = new Set(aliases.map(normalizeName));
  return sumAvailable(
    overview.protocols
      .filter((protocol) => names.has(normalizeName(protocol.name)))
      .map((protocol) => protocol[field] ?? null),
  );
}

function getTvl(
  protocols: DefillamaProtocol[],
  aliases: string[],
) {
  const names = new Set(aliases.map(normalizeName));
  return sumAvailable(
    protocols
      .filter((protocol) => names.has(normalizeName(protocol.name)))
      .map((protocol) => protocol.chainTvls?.Cardano ?? protocol.tvl ?? null),
  );
}

function getLogo(protocols: DefillamaProtocol[], aliases: string[]) {
  const names = new Set(aliases.map(normalizeName));
  return (
    protocols.find(
      (protocol) =>
        names.has(normalizeName(protocol.name)) && Boolean(protocol.logo),
    )?.logo || null
  );
}

function buildBenchmarkSeries(
  overview: DefillamaOverview | null,
  configs: DexConfig[],
): VolumeSeriesPoint[] {
  if (!overview) return [];
  const totals = new Map(overview.totalDataChart);

  return overview.totalDataChartBreakdown.map(([timestamp, values]) => {
    const byDex: Record<string, number> = {};

    for (const config of configs) {
      const names = new Set(config.volumeAliases.map(normalizeName));
      const value = Object.entries(values).reduce(
        (sum, [name, amount]) =>
          names.has(normalizeName(name)) ? sum + amount : sum,
        0,
      );
      if (value > 0) byDex[config.id] = value;
    }

    return { timestamp, totalUsd: totals.get(timestamp) || 0, byDex };
  });
}

export function buildDexRows({
  overview,
  protocols,
  nativeSnapshots,
  versionSnapshots,
}: {
  overview: DefillamaOverview | null;
  protocols: DefillamaProtocol[];
  nativeSnapshots: Map<string, NativeDexSnapshot>;
  versionSnapshots: Map<string, NativeDexSnapshot>;
}) {
  const configs = [...DEX_REGISTRY, ...addDynamicDexes(protocols, overview)];
  const latestBenchmarkAt = overview?.totalDataChart.at(-1)?.[0]
    ? new Date((overview.totalDataChart.at(-1)?.[0] || 0) * 1000).toISOString()
    : null;

  const rows = configs.map<DexMetric>((config) => {
    const native = nativeSnapshots.get(config.id) || null;
    const benchmark24 = getDefillamaMetric(
      overview,
      config.volumeAliases,
      "total24h",
    );
    const benchmark7 = getDefillamaMetric(
      overview,
      config.volumeAliases,
      "total7d",
    );
    const benchmark30 = getDefillamaMetric(
      overview,
      config.volumeAliases,
      "total30d",
    );
    const benchmarkPrevious7 = getDefillamaMetric(
      overview,
      config.volumeAliases,
      "total14dto7d",
    );
    const native24 = native?.volume24hUsd ?? null;
    const quality: QualityFlag = classifySourceQuality(native24, benchmark24);
    const alignedHistory =
      quality === "aligned" &&
      [
        "wingriders",
        "sundaeswap",
        "dano-finance",
        "deltadefi",
        "saturn-swap",
      ].includes(config.id);
    // DefiLlama's WingRiders adapter reads this same official endpoint. Keep
    // its rolling history available while the native feed is healthy, but
    // leave any current-snapshot variance visible instead of calling it aligned.
    const wingridersLineageHistory =
      config.id === "wingriders" && native24 != null && benchmark7 != null;
    const useBenchmarkHistory = alignedHistory || wingridersLineageHistory;
    const volume7 = native?.volume7dUsd ?? (useBenchmarkHistory ? benchmark7 : null);
    const volume30 =
      native?.volume30dUsd ?? (useBenchmarkHistory ? benchmark30 : null);
    const previous7 =
      native?.previous7dUsd ?? (useBenchmarkHistory ? benchmarkPrevious7 : null);
    const tvl = native?.tvlUsd ?? getTvl(protocols, config.tvlAliases);

    return {
      id: config.id,
      name: config.name,
      rowKind: "protocol",
      tableRole: DEX_VERSION_REGISTRY.some(
        (version) => version.parentId === config.id && version.showInTable,
      )
        ? "detail"
        : "primary",
      parentId: null,
      protocolVersion: null,
      logo: getLogo(protocols, config.tvlAliases),
      color: config.color,
      volume24hUsd: native24,
      volume7dUsd: volume7,
      volume30dUsd: volume30,
      previous7dUsd: previous7,
      weekChangePct: safePercentChange(volume7, previous7),
      tvlUsd: tvl,
      volumeToTvl: safeDivide(native24, tvl),
      marketShare24hPct: null,
      rank7d: null,
      trades24h: native?.trades24h ?? null,
      users24h: native?.users24h ?? null,
      dau24h: native?.dau24h ?? null,
      fees24hUsd: native?.fees24hUsd ?? null,
      fees7dUsd: native?.fees7dUsd ?? null,
      marketCapUsd: native?.marketCapUsd ?? null,
      marketCapToTvl: safeDivide(native?.marketCapUsd ?? null, tvl),
      poolCount: native?.poolCount ?? null,
      nativeVolume24hUsd: native24,
      defillamaVolume24hUsd: benchmark24,
      defillamaVolume7dUsd: benchmark7,
      defillamaVolume30dUsd: benchmark30,
      defillamaPrevious7dUsd: benchmarkPrevious7,
      variance24hPct: variancePct(native24, benchmark24),
      quality,
      sourceLabel: native
        ? alignedHistory
          ? `${native.sourceLabel} + validated DefiLlama history`
          : wingridersLineageHistory
            ? `${native.sourceLabel} + DefiLlama history from the same WingRiders feed`
          : native.sourceLabel
        : benchmark24 != null
          ? "DefiLlama benchmark only"
          : "Data unavailable",
      sourceUrl: native?.sourceUrl || null,
      periodNote: native?.periodNote || "No public native volume endpoint configured.",
      lastDataAt: native?.dataAt || latestBenchmarkAt,
    };
  });

  const observed24 = sumAvailable(rows.map((row) => row.volume24hUsd));
  const ranked = rows
    .filter((row) => row.volume7dUsd != null)
    .sort((a, b) => (b.volume7dUsd || 0) - (a.volume7dUsd || 0));

  for (const row of rows) {
    row.marketShare24hPct =
      observed24 && row.volume24hUsd != null
        ? (row.volume24hUsd / observed24) * 100
        : null;
    const rank = ranked.findIndex((candidate) => candidate.id === row.id);
    row.rank7d = rank >= 0 ? rank + 1 : null;
  }

  const versionRows = DEX_VERSION_REGISTRY.flatMap<DexMetric>((version) => {
    const parent = rows.find((row) => row.id === version.parentId);
    if (!parent) return [];
    const native = versionSnapshots.get(version.id) || null;
    const useParent = Boolean(version.useParentMetrics && !native);
    const volume24 = native?.volume24hUsd ?? (useParent ? parent.volume24hUsd : null);
    const volume7 = native?.volume7dUsd ?? (useParent ? parent.volume7dUsd : null);
    const volume30 = native?.volume30dUsd ?? (useParent ? parent.volume30dUsd : null);
    const previous7 = native?.previous7dUsd ?? (useParent ? parent.previous7dUsd : null);
    const tvl = native?.tvlUsd ?? (useParent ? parent.tvlUsd : null);
    const inheritedNote = useParent
      ? `Mapped to ${version.name}, the configured primary deployment. The official API reports one protocol total, so activity from legacy contracts cannot be separated.`
      : null;

    return [{
      id: version.id,
      name: version.name,
      rowKind: "version",
      tableRole: version.showInTable ? "primary" : "hidden",
      parentId: version.parentId,
      protocolVersion: version.version,
      logo: version.logo || parent.logo,
      color: parent.color,
      volume24hUsd: volume24,
      volume7dUsd: volume7,
      volume30dUsd: volume30,
      previous7dUsd: previous7,
      weekChangePct: safePercentChange(volume7, previous7),
      tvlUsd: tvl,
      volumeToTvl: safeDivide(volume24, tvl),
      marketShare24hPct:
        observed24 && volume24 != null ? (volume24 / observed24) * 100 : null,
      rank7d: useParent ? parent.rank7d : null,
      trades24h: native?.trades24h ?? (useParent ? parent.trades24h : null),
      users24h: native?.users24h ?? (useParent ? parent.users24h : null),
      dau24h: native?.dau24h ?? (useParent ? parent.dau24h : null),
      fees24hUsd: native?.fees24hUsd ?? (useParent ? parent.fees24hUsd : null),
      fees7dUsd: native?.fees7dUsd ?? (useParent ? parent.fees7dUsd : null),
      marketCapUsd: native?.marketCa