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
  derivePreviousRollingPeriod,
  nonNegativeFiniteOrNull,
  safeDivide,
  safePercentChange,
  sumAvailable,
  validateCumulativeVolumes,
  validateUsdAdaPair,
  variancePct,
  type CumulativeVolumeIssue,
} from "@/lib/calculations";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { parsePoolFlowWingRidersV1 } from "@/lib/poolflow";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";
import { loadCachedSource } from "@/lib/source-snapshot-cache";
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

const wingridersGraphqlSchema = z.object({
  data: z.object({
    volume24h: wingridersMetricSchema,
    volume7d: wingridersMetricSchema,
    volume14d: wingridersMetricSchema,
    volume30d: wingridersMetricSchema,
    tvl: wingridersMetricSchema,
    poolsCount: z.number().int().nonnegative(),
    currentTime: z.string().datetime(),
  }),
});

const WINGRIDERS_METRICS_QUERY = `
  query DashboardVolume {
    volume24h: volume(input: { lastNHours: 24, baseCurrency: ADA })
    volume7d: volume(input: { lastNHours: 168, baseCurrency: ADA })
    volume14d: volume(input: { lastNHours: 336, baseCurrency: ADA })
    volume30d: volume(input: { lastNHours: 720, baseCurrency: ADA })
    tvl
    poolsCount
    currentTime
  }
`;

export function parseWingRidersPayload(payload: unknown) {
  return wingridersSchema.parse(payload);
}

export function parseWingRidersGraphqlPayload(payload: unknown) {
  return wingridersGraphqlSchema.parse(payload);
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
  try {
    const snapshot = await loadCachedSource({
      sourceId: id,
      endpoint,
      load: async () => {
        const fetchedAt = new Date().toISOString();
        const data = await load();
        return {
          data,
          fetchedAt,
          observedAt: dataAt?.(data) || fetchedAt,
        };
      },
    });
    const { data, fetchedAt, observedAt } = snapshot;
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
    const fetchedAt = new Date().toISOString();
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

function periodParam(url: string, days: 1 | 7 | 30) {
  const parsed = new URL(url);
  parsed.searchParams.set("days", String(days));
  return parsed.toString();
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

function describeCumulativeVolumeIssues(issues: CumulativeVolumeIssue[]) {
  const descriptions = issues.map((issue) => {
    switch (issue) {
      case "invalid-24h":
        return "24h volume was not a finite non-negative value";
      case "invalid-7d":
        return "7d volume was not a finite non-negative value";
      case "invalid-30d":
        return "30d volume was not a finite non-negative value";
      case "7d-below-24h":
        return "7d volume was lower than 24h volume";
      case "30d-below-24h":
        return "30d volume was lower than 24h volume";
      case "30d-below-7d":
        return "30d volume was lower than 7d volume";
    }
  });

  return descriptions.length
    ? `Data quality guard: ${descriptions.join("; ")}. The inconsistent value is not displayed.`
    : null;
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
  const periodWarnings: string[] = [];
  const latestBenchmarkAt = overview?.totalDataChart.at(-1)?.[0]
    ? new Date((overview.totalDataChart.at(-1)?.[0] || 0) * 1000).toISOString()
    : null;

  const rows = configs.map<DexMetric>((config) => {
    const native = nativeSnapshots.get(config.id) || null;
    const benchmark24 = nonNegativeFiniteOrNull(
      getDefillamaMetric(overview, config.volumeAliases, "total24h"),
    );
    const benchmark7 = nonNegativeFiniteOrNull(
      getDefillamaMetric(overview, config.volumeAliases, "total7d"),
    );
    const benchmark30 = nonNegativeFiniteOrNull(
      getDefillamaMetric(overview, config.volumeAliases, "total30d"),
    );
    const benchmarkPrevious7 = nonNegativeFiniteOrNull(
      getDefillamaMetric(overview, config.volumeAliases, "total14dto7d"),
    );
    const rawNative24 = native?.volume24hUsd ?? null;
    const native24 = nonNegativeFiniteOrNull(rawNative24);
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
    const useBenchmarkHistory = alignedHistory;
    const candidate7 =
      native?.volume7dUsd ?? (useBenchmarkHistory ? benchmark7 : null);
    const candidate30 =
      native?.volume30dUsd ?? (useBenchmarkHistory ? benchmark30 : null);
    const previous7 = nonNegativeFiniteOrNull(
      native?.previous7dUsd ?? (useBenchmarkHistory ? benchmarkPrevious7 : null),
    );
    const validatedPeriods = validateCumulativeVolumes(
      rawNative24,
      candidate7,
      candidate30,
    );
    const volume24 = validatedPeriods.volume24h;
    const benchmarkHistoryRejected =
      useBenchmarkHistory && validatedPeriods.issues.length > 0;
    const volume7 =
      benchmarkHistoryRejected && native?.volume7dUsd == null
        ? null
        : validatedPeriods.volume7d;
    const volume30 =
      benchmarkHistoryRejected && native?.volume30dUsd == null
        ? null
        : validatedPeriods.volume30d;
    const validatedPrevious7 =
      benchmarkHistoryRejected && native?.previous7dUsd == null
        ? null
        : previous7;
    const validationIssueNote = describeCumulativeVolumeIssues(
      validatedPeriods.issues,
    );
    const periodValidationNote = [
      validationIssueNote,
      benchmarkHistoryRejected
        ? "The complete DefiLlama history set was excluded because its periods did not reconcile."
        : null,
    ].filter(Boolean).join(" ") || null;
    if (periodValidationNote) {
      periodWarnings.push(`${config.name}: ${periodValidationNote}`);
    }
    const benchmarkHistoryUsed =
      useBenchmarkHistory &&
      ((native?.volume7dUsd == null && volume7 != null) ||
        (native?.volume30dUsd == null && volume30 != null) ||
        (native?.previous7dUsd == null && validatedPrevious7 != null));
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
      volume24hUsd: volume24,
      volume7dUsd: volume7,
      volume30dUsd: volume30,
      previous7dUsd: validatedPrevious7,
      weekChangePct: safePercentChange(volume7, validatedPrevious7),
      tvlUsd: tvl,
      volumeToTvl: safeDivide(volume24, tvl),
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
      nativeVolume24hUsd: volume24,
      defillamaVolume24hUsd: benchmark24,
      defillamaVolume7dUsd: benchmark7,
      defillamaVolume30dUsd: benchmark30,
      defillamaPrevious7dUsd: benchmarkPrevious7,
      variance24hPct: variancePct(volume24, benchmark24),
      quality,
      sourceLabel: native
        ? benchmarkHistoryUsed
          ? `${native.sourceLabel} + validated DefiLlama history`
          : native.sourceLabel
        : benchmark24 != null
          ? "DefiLlama benchmark only"
          : "Data unavailable",
      sourceUrl: native?.sourceUrl || null,
      periodNote: [
        native?.periodNote || "No public native volume endpoint configured.",
        periodValidationNote,
      ].filter(Boolean).join(" "),
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
    const candidate24 = native?.volume24hUsd ?? (useParent ? parent.volume24hUsd : null);
    const candidate7 = native?.volume7dUsd ?? (useParent ? parent.volume7dUsd : null);
    const candidate30 = native?.volume30dUsd ?? (useParent ? parent.volume30dUsd : null);
    const validatedPeriods = validateCumulativeVolumes(
      candidate24,
      candidate7,
      candidate30,
    );
    const volume24 = validatedPeriods.volume24h;
    const volume7 = validatedPeriods.volume7d;
    const volume30 = validatedPeriods.volume30d;
    const previous7 = nonNegativeFiniteOrNull(
      native?.previous7dUsd ?? (useParent ? parent.previous7dUsd : null),
    );
    const tvl = native?.tvlUsd ?? (useParent ? parent.tvlUsd : null);
    const periodValidationNote = describeCumulativeVolumeIssues(
      validatedPeriods.issues,
    );
    if (periodValidationNote) {
      periodWarnings.push(`${version.name}: ${periodValidationNote}`);
    }
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
      marketCapUsd: native?.marketCapUsd ?? (useParent ? parent.marketCapUsd : null),
      marketCapToTvl: safeDivide(
        native?.marketCapUsd ?? (useParent ? parent.marketCapUsd : null),
        tvl,
      ),
      poolCount: native?.poolCount ?? (useParent ? parent.poolCount : null),
      nativeVolume24hUsd: native?.volume24hUsd ?? (useParent ? parent.nativeVolume24hUsd : null),
      defillamaVolume24hUsd: useParent ? parent.defillamaVolume24hUsd : null,
      defillamaVolume7dUsd: useParent ? parent.defillamaVolume7dUsd : null,
      defillamaVolume30dUsd: useParent ? parent.defillamaVolume30dUsd : null,
      defillamaPrevious7dUsd: useParent ? parent.defillamaPrevious7dUsd : null,
      variance24hPct: useParent ? parent.variance24hPct : null,
      quality: native ? "native-only" : useParent ? parent.quality : "unavailable",
      sourceLabel: native?.sourceLabel || (useParent ? `${parent.sourceLabel} · primary ${version.version} mapping` : "Version metrics unavailable"),
      sourceUrl: native?.sourceUrl || parent.sourceUrl,
      periodNote: [
        native?.periodNote || inheritedNote || version.unavailableNote,
        periodValidationNote,
      ].filter(Boolean).join(" "),
      lastDataAt: native?.dataAt || (useParent ? parent.lastDataAt : null),
    }];
  });

  rows.sort((a, b) => {
    if (a.volume7dUsd == null && b.volume7dUsd == null) {
      return (b.tvlUsd || 0) - (a.tvlUsd || 0);
    }
    if (a.volume7dUsd == null) return 1;
    if (b.volume7dUsd == null) return -1;
    return b.volume7dUsd - a.volume7dUsd;
  });

  return {
    rows: [...rows, ...versionRows],
    protocolRows: rows,
    configs,
    periodWarnings,
  };
}

export async function loadLiveDashboardData(): Promise<DashboardData> {
  const previousDay = latestCompleteDayStart();
  const minswapBody = (
    field: "volume_24h" | "volume_7d",
    currency?: "usd",
  ) => ({
    limit: 100,
    only_verified: false,
    sort_direction: "desc",
    sort_field: field,
    ...(currency ? { currency } : {}),
  });

  const [
    defillamaOverview,
    defillamaProtocols,
    coinGecko,
    coinbase,
    minswap,
    wingriders,
    wingridersFees,
    poolflowWingridersV1,
    sundaeswap,
    splash,
    muesli,
    vyfinance,
    dano,
    delta,
    saturn,
  ] = await Promise.all([
    capture({
      id: "defillama-volume",
      label: "DefiLlama DEX benchmark",
      endpoint: SOURCE_ENDPOINTS.defillamaVolume,
      expectedUpdateMinutes: 1_560,
      load: async () =>
        defillamaOverviewSchema.parse(
          await fetchJsonWithRetry(SOURCE_ENDPOINTS.defillamaVolume),
        ),
      dataAt: (data) => {
        const latest = data.totalDataChart.at(-1)?.[0];
        return latest ? new Date(latest * 1000).toISOString() : null;
      },
    }),
    capture({
      id: "defillama-tvl",
      label: "DefiLlama protocol TVL",
      endpoint: SOURCE_ENDPOINTS.defillamaProtocols,
      expectedUpdateMinutes: 120,
      load: async () =>
        defillamaProtocolsSchema.parse(
          await fetchJsonWithRetry(SOURCE_ENDPOINTS.defillamaProtocols),
        ),
    }),
    capture({
      id: "coingecko-price",
      label: "CoinGecko ADA/USD",
      endpoint: SOURCE_ENDPOINTS.coinGeckoPrice,
      expectedUpdateMinutes: 240,
      load: async () =>
        coinGeckoSchema.parse(await fetchJsonWithRetry(SOURCE_ENDPOINTS.coinGeckoPrice)),
      dataAt: (data) =>
        new Date(data.cardano.last_updated_at * 1000).toISOString(),
    }),
    capture({
      id: "coinbase-price",
      label: "Coinbase ADA/USD fallback",
      endpoint: SOURCE_ENDPOINTS.coinbasePrice,
      expectedUpdateMinutes: 60,
      load: async () =>
        coinbaseSchema.parse(await fetchJsonWithRetry(SOURCE_ENDPOINTS.coinbasePrice)),
    }),
    capture({
      id: "minswap-native",
      label: "Minswap native pool analytics",
      endpoint: SOURCE_ENDPOINTS.minswapPools,
      expectedUpdateMinutes: 120,
      load: async () => {
        const [dayUsd, weekUsd, dayAda] = await Promise.all([
          fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(minswapBody("volume_24h", "usd")),
          }),
          fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(minswapBody("volume_7d", "usd")),
          }),
          fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(minswapBody("volume_24h")),
          }),
        ]);
        return {
          dayUsd: minswapSchema.parse(dayUsd),
          weekUsd: minswapSchema.parse(weekUsd),
          dayAda: minswapSchema.parse(dayAda),
        };
      },
    }),
    capture({
      id: "wingriders-native",
      label: "WingRiders official GraphQL",
      endpoint: SOURCE_ENDPOINTS.wingridersGraphql,
      expectedUpdateMinutes: 120,
      load: async () =>
        parseWingRidersGraphqlPayload(
          await fetchJsonWithRetry(SOURCE_ENDPOINTS.wingridersGraphql, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: WINGRIDERS_METRICS_QUERY }),
          }),
        ),
      dataAt: (data) => data.data.currentTime,
    }),
    capture({
      id: "wingriders-fees",
      label: "WingRiders official daily fees",
      endpoint: SOURCE_ENDPOINTS.wingriders,
      expectedUpdateMinutes: 120,
      load: async () =>
        parseWingRidersPayload(await fetchJsonWithRetry(SOURCE_ENDPOINTS.wingriders)),
    }),
    capture({
      id: "poolflow-wingriders-v1",
      label: "PoolFlow WingRiders V1 market row",
      endpoint: SOURCE_ENDPOINTS.poolflowMarkets,
      expectedUpdateMinutes: 120,
      load: async () => {
        const [day, week, month] = await Promise.all(
          ([1, 7, 30] as const).map(async (days) =>
            parsePoolFlowWingRidersV1(
              await fetchJsonWithRetry(
                periodParam(SOURCE_ENDPOINTS.poolflowMarkets, days),
              ),
            ),
          ),
        );
        return { day, week, month };
      },
    }),
    capture({
      id: "sundaeswap-native",
      label: "SundaeSwap official GraphQL",
      endpoint: SOURCE_ENDPOINTS.sundaeswap,
      expectedUpdateMinutes: 120,
      load: async () =>
        sundaeswapSchema.parse(
          await fetchJsonWithRetry(SOURCE_ENDPOINTS.sundaeswap, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query:
                "query StatsVolume { protocols { version } stats { poolCount volume { asset { id } quantity } } }",
            }),
          }),
        ),
    }),
    capture({
      id: "splash-native",
      label: "Splash official analytics",
      endpoint: SOURCE_ENDPOINTS.splash,
      expectedUpdateMinutes: 120,
      load: async () => splashSchema.parse(await fetchJsonWithRetry(SOURCE_ENDPOINTS.splash)),
    }),
    capture({
      id: "muesliswap-native",
      label: "MuesliSwap official analytics",
      endpoint: SOURCE_ENDPOINTS.muesliVolume,
      expectedUpdateMinutes: 1_560,
      load: async () => {
        const [volume, tvl] = await Promise.all([
          fetchJsonWithRetry(SOURCE_ENDPOINTS.muesliVolume),
          fetchJsonWithRetry(SOURCE_ENDPOINTS.muesliTvl),
        ]);
        return {
          volume: muesliVolumeSchema.parse(volume),
          tvl: muesliTvlSchema.parse(tvl),
        };
      },
      dataAt: (data) => {
        const latest = data.tvl.at(-1)?.date;
        return latest ? new Date(`${latest}T00:00:00.000Z`).toISOString() : null;
      },
    }),
    capture({
      id: "vyfinance-native",
      label: "VyFinance official analytics",
      endpoint: SOURCE_ENDPOINTS.vyfinance,
      expectedUpdateMinutes: 120,
      load: async () =>
        vyfinanceSchema.parse(
          await fetchJsonWithRetry(SOURCE_ENDPOINTS.vyfinance, {
            headers: { "content-type": "application/json" },
          }),
        ),
    }),
    capture({
      id: "dano-native",
      label: "Dano Finance official gateway",
      endpoint: SOURCE_ENDPOINTS.dano,
      expectedUpdateMinutes: 3_000,
      load: async () =>
        danoSchema.parse(
          await fetchJsonWithRetry(timestampParam(SOURCE_ENDPOINTS.dano, previousDay)),
        ),
      dataAt: () => new Date(previousDay).toISOString(),
    }),
    capture({
      id: "delta-native",
      label: "DeltaDeFi official metrics",
      endpoint: SOURCE_ENDPOINTS.delta,
      expectedUpdateMinutes: 3_000,
      load: async () =>
        deltaSchema.parse(
          await fetchJsonWithRetry(timestampParam(SOURCE_ENDPOINTS.delta, previousDay)),
        ),
      dataAt: () => new Date(previousDay).toISOString(),
    }),
    capture({
      id: "saturn-native",
      label: "Saturn Swap official metrics",
      endpoint: SOURCE_ENDPOINTS.saturn,
      expectedUpdateMinutes: 3_000,
      load: async () =>
        saturnSchema.parse(
          await fetchJsonWithRetry(timestampParam(SOURCE_ENDPOINTS.saturn, previousDay)),
        ),
      dataAt: () => new Date(previousDay).toISOString(),
    }),
  ]);

  const coinGeckoRaw = coinGecko.data?.cardano || null;
  const coinGeckoAge = coinGeckoRaw
    ? Date.now() - coinGeckoRaw.last_updated_at * 1000
    : Number.POSITIVE_INFINITY;
  const coinGeckoUsd =
    coinGeckoRaw && coinGeckoAge <= 4 * 60 * 60_000 ? coinGeckoRaw.usd : null;
  const coinbaseUsd = Number(coinbase.data?.data.amount);
  const validCoinbaseUsd =
    Number.isFinite(coinbaseUsd) && coinbaseUsd > 0 ? coinbaseUsd : null;
  const adaUsd = coinGeckoUsd ?? validCoinbaseUsd;
  const priceSource = coinGeckoUsd != null ? "CoinGecko" : validCoinbaseUsd != null ? "Coinbase" : "Unavailable";
  const priceTimestamp =
    coinGeckoUsd != null && coinGeckoRaw
      ? new Date(coinGeckoRaw.last_updated_at * 1000).toISOString()
      : validCoinbaseUsd != null
        ? coinbase.status.fetchedAt
        : null;
  const priceEndpoint =
    coinGeckoUsd != null
      ? SOURCE_ENDPOINTS.coinGeckoPrice
      : validCoinbaseUsd != null
        ? SOURCE_ENDPOINTS.coinbasePrice
        : SOURCE_ENDPOINTS.coinGeckoPrice;
  const todaySeconds = Math.floor(Date.now() / 86_400_000) * 86_400;
  const nativeSnapshots = new Map<string, NativeDexSnapshot>();
  const versionSnapshots = new Map<string, NativeDexSnapshot>();

  if (minswap.data) {
    const dayUsd = sumField(
      minswap.data.dayUsd.pool_metrics as Array<Record<string, unknown>>,
      "volume_24h",
    );
    const weekUsd = sumField(
      minswap.data.weekUsd.pool_metrics as Array<Record<string, unknown>>,
      "volume_7d",
    );
    const dayAda = sumField(
      minswap.data.dayAda.pool_metrics as Array<Record<string, unknown>>,
      "volume_24h",
    );
    const currencyCheck = validateUsdAdaPair(dayUsd, dayAda, adaUsd);

    if (currencyCheck.status === "mismatch") {
      minswap.status.health = "error";
      minswap.status.message = `Minswap USD/ADA unit check differs from ${priceSource} by ${Math.abs(currencyCheck.deviationPct || 0).toFixed(1)}%; Minswap volumes were rejected.`;
    } else {
      const unitNote =
        currencyCheck.status === "aligned"
          ? `currency=\"usd\" verified against the no-currency ADA response; implied ADA/USD ${currencyCheck.impliedAdaUsd?.toFixed(4)} (${Math.abs(currencyCheck.deviationPct || 0).toFixed(1)}% from ${priceSource}).`
          : `currency=\"usd\" requested per the official API contract; live cross-unit validation was unavailable because no fresh ADA/USD reference price was available.`;
      nativeSnapshots.set("minswap", {
        id: "minswap",
        volume24hUsd: dayUsd,
        volume7dUsd: weekUsd,
        volume30dUsd: null,
        previous7dUsd: null,
        tvlUsd: null,
        fees24hUsd: sumMinswapField(
          minswap.data.dayUsd.pool_metrics,
          "trading_fee_24h",
        ),
        fees7dUsd: sumMinswapField(
          minswap.data.weekUsd.pool_metrics,
          "trading_fee_7d",
        ),
        poolCount: minswap.data.dayUsd.pool_metrics.length,
        sourceLabel: "Minswap native API (USD unit-checked)",
        sourceUrl: SOURCE_ENDPOINTS.minswapPools,
        periodNote: `${unitNote} Rolling windows; sum of the top 100 pools ranked by each metric. This is a documented lower bound.`,
        dataAt: minswap.status.fetchedAt,
      });

      for (const version of DEX_VERSION_REGISTRY.filter(
        (entry) => entry.parentId === "minswap" && entry.nativeType,
      )) {
        const summary = summarizeMinswapVersion(
          minswap.data.dayUsd.pool_metrics,
          minswap.data.weekUsd.pool_metrics,
          version.nativeType || "",
        );
        if (!summary) continue;

        versionSnapshots.set(version.id, {
          id: version.id,
          volume24hUsd: summary.volume24hUsd,
          volume7dUsd: summary.volume7dUsd,
          volume30dUsd: null,
          previous7dUsd: null,
          tvlUsd: summary.tvlUsd,
          fees24hUsd: summary.fees24hUsd,
          fees7dUsd: summary.fees7dUsd,
          poolCount: summary.poolCount,
          sourceLabel: "Minswap version-level native API",
          sourceUrl: SOURCE_ENDPOINTS.minswapPools,
          periodNote: `${unitNote} Version is mapped from pool_metrics[].type. Volume, fees, liquidity and pool count are lower bounds from the top 100 pools ranked separately for 24h and 7d.`,
          dataAt: minswap.status.fetchedAt,
        });
      }
    }
  }

  if (wingriders.data || wingridersFees.data) {
    const metrics = wingriders.data?.data;
    const fallback = wingridersFees.data;
    const previous7dAda = metrics
      ? derivePreviousRollingPeriod(metrics.volume14d, metrics.volume7d)
      : null;
    nativeSnapshots.set("wingriders", {
      id: "wingriders",
      volume24hUsd: adaToUsd(
        metrics?.volume24h ?? fallback?.dailyVolume ?? null,
        adaUsd,
      ),
      volume7dUsd: adaToUsd(metrics?.volume7d ?? null, adaUsd),
      volume30dUsd: adaToUsd(metrics?.volume30d ?? null, adaUsd),
      previous7dUsd: adaToUsd(previous7dAda, adaUsd),
      tvlUsd: adaToUsd(metrics?.tvl ?? null, adaUsd),
      fees24hUsd: adaToUsd(fallback?.dailyFees ?? null, adaUsd),
      poolCount: metrics?.poolsCount ?? null,
      sourceLabel: metrics
        ? "WingRiders official GraphQL"
        : "WingRiders official daily API fallback",
      sourceUrl: metrics
        ? SOURCE_ENDPOINTS.wingridersGraphql
        : SOURCE_ENDPOINTS.wingriders,
      periodNote: metrics
        ? "Rolling 24h, 7d, 14d and 30d protocol metrics supplied by WingRiders in ADA. Previous 7d equals the validated 14d total minus the current 7d total. The protocol API does not split V1 and V2."
        : "Current daily volume supplied by the WingRiders fallback endpoint in ADA. Period history and TVL are unavailable while GraphQL is offline.",
      dataAt: metrics
        ? wingriders.status.dataAt
        : wingridersFees.status.fetchedAt,
    });
  }

  if (poolflowWingridersV1.data) {
    const { day, week, month } = poolflowWingridersV1.data;
    versionSnapshots.set("wingriders-v1", {
      id: "wingriders-v1",
      volume24hUsd: adaToUsd(day.volumeAda, adaUsd),
      volume7dUsd: adaToUsd(week.volumeAda, adaUsd),
      volume30dUsd: adaToUsd(month.volumeAda, adaUsd),
      previous7dUsd: null,
      tvlUsd: adaToUsd(day.tvlAda, adaUsd),
      trades24h: day.trades,
      users24h: day.users,
      dau24h: day.dau,
      fees24hUsd: adaToUsd(day.feesAda, adaUsd),
      fees7dUsd: adaToUsd(week.feesAda, adaUsd),
      sourceLabel: "PoolFlow public market overview · WingRiders V1 only",
      sourceUrl: periodParam(SOURCE_ENDPOINTS.poolflowMarkets, 1),
      periodNote: "PoolFlow's exact WingRiders row is used only for the legacy V1 table row. Values are ADA-denominated period totals for 24h, 7d and 30d. The endpoint has no published schema, provider timestamp or SLA; structural and cumulative checks fail closed. Previous 7d and TVL remain unavailable unless explicitly returned.",
      dataAt: poolflowWingridersV1.status.fetchedAt,
    });
  }

  if (sundaeswap.data) {
    const volume = sundaeswap.data.data.stats.volume;
    const ada = Number(volume.quantity) / 1_000_000;
    nativeSnapshots.set("sundaeswap", {
      id: "sundaeswap",
      volume24hUsd: volume.asset.id.includes("lovelace") ? adaToUsd(ada, adaUsd) : null,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: null,
      poolCount: sundaeswap.data.data.stats.poolCount,
      sourceLabel: "SundaeSwap official GraphQL",
      sourceUrl: SOURCE_ENDPOINTS.sundaeswap,
      periodNote: "Current protocol volume supplied in lovelace. Pool count is aggregate; the schema confirms V1 and V3 but does not split stats by version.",
      dataAt: sundaeswap.status.fetchedAt,
    });
  }

  if (splash.data) {
    nativeSnapshots.set("splash", {
      id: "splash",
      volume24hUsd: Number(splash.data.volumeUsd) / 1_000_000,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: Number(splash.data.tvlUsd) / 1_000_000,
      sourceLabel: "Splash official analytics",
      sourceUrl: SOURCE_ENDPOINTS.splash,
      periodNote: "Rolling 24h protocol metric; DefiLlama history is excluded after a material variance check.",
      dataAt: splash.status.fetchedAt,
    });
  }

  if (muesli.data) {
    const completeDay = todaySeconds - 86_400;
    const volume = muesli.data.volume;
    const latestTvl = muesli.data.tvl.at(-1)?.tvl;
    nativeSnapshots.set("muesliswap", {
      id: "muesliswap",
      volume24hUsd: adaToUsd(volume[String(completeDay)] ?? 0, adaUsd),
      volume7dUsd: adaToUsd(
        sumPeriod(volume, todaySeconds - 7 * 86_400, todaySeconds),
        adaUsd,
      ),
      volume30dUsd: adaToUsd(
        sumPeriod(volume, todaySeconds - 30 * 86_400, todaySeconds),
        adaUsd,
      ),
      previous7dUsd: adaToUsd(
        sumPeriod(volume, todaySeconds - 14 * 86_400, todaySeconds - 7 * 86_400),
        adaUsd,
      ),
      tvlUsd:
        latestTvl == null ? null : adaToUsd(latestTvl / 1_000_000, adaUsd),
      sourceLabel: "MuesliSwap official analytics",
      sourceUrl: SOURCE_ENDPOINTS.muesliVolume,
      periodNote: "UTC calendar-day series; missing dates inside the returned window are treated as zero volume.",
      dataAt: new Date(completeDay * 1000).toISOString(),
    });
  }

  if (vyfinance.data) {
    const metrics = vyfinance.data.allPoolsAnalytics;
    nativeSnapshots.set("vyfinance", {
      id: "vyfinance",
      volume24hUsd: adaToUsd(metrics.volume24H, adaUsd),
      volume7dUsd: adaToUsd(metrics.volume7D, adaUsd),
      volume30dUsd: null,
      previous7dUsd: adaToUsd(
        Math.max(0, metrics.volume14D - metrics.volume7D),
        adaUsd,
      ),
      tvlUsd: adaToUsd(metrics.tvl, adaUsd),
      sourceLabel: "VyFinance official analytics",
      sourceUrl: SOURCE_ENDPOINTS.vyfinance,
      periodNote: "Rolling 24h, 7d and 14d metrics supplied in ADA; 30d is not public.",
      dataAt: vyfinance.status.fetchedAt,
    });
  }

  if (dano.data) {
    nativeSnapshots.set("dano-finance", {
      id: "dano-finance",
      volume24hUsd: adaToUsd(
        Number(dano.data.data.dailyVolumeAdaValue) / 1_000_000,
        adaUsd,
      ),
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: null,
      sourceLabel: "Dano official gateway",
      sourceUrl: SOURCE_ENDPOINTS.dano,
      periodNote: "Latest complete UTC day supplied in lovelace.",
      dataAt: dano.status.dataAt,
    });
  }

  if (delta.data) {
    nativeSnapshots.set("deltadefi", {
      id: "deltadefi",
      volume24hUsd: delta.data.volume_usd,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: null,
      sourceLabel: "DeltaDeFi official metrics",
      sourceUrl: SOURCE_ENDPOINTS.delta,
      periodNote: "Latest complete UTC-day volume supplied in USD.",
      dataAt: delta.status.dataAt,
    });
  }

  if (saturn.data) {
    nativeSnapshots.set("saturn-swap", {
      id: "saturn-swap",
      volume24hUsd: saturn.data.volume.volume,
      volume7dUsd: null,
      volume30dUsd: null,
      previous7dUsd: null,
      tvlUsd: null,
      sourceLabel: "Saturn Swap official metrics",
      sourceUrl: SOURCE_ENDPOINTS.saturn,
      periodNote: "Latest complete UTC-day metric supplied for DefiLlama ingestion.",
      dataAt: saturn.status.dataAt,
    });
  }

  const protocols = defillamaProtocols.data || [];
  const { rows, protocolRows, configs, periodWarnings } = buildDexRows({
    overview: defillamaOverview.data,
    protocols,
    nativeSnapshots,
    versionSnapshots,
  });
  const comparableWeek = protocolRows.filter(
    (row) => row.volume7dUsd != null && row.previous7dUsd != null,
  );
  const comparableCurrent = sumAvailable(
    comparableWeek.map((row) => row.volume7dUsd),
  );
  const comparablePrevious = sumAvailable(
    comparableWeek.map((row) => row.previous7dUsd),
  );
  const overview = defillamaOverview.data;
  const benchmarkTvl = sumAvailable(
    configs.map((config) => getTvl(protocols, config.tvlAliases)),
  );
  const warnings = [
    "Reconciled totals are observed coverage across DEXes with usable public native metrics; they are not represented as complete Cardano market totals.",
    ...periodWarnings,
  ];

  for (const row of protocolRows) {
    if (row.quality === "material-variance") {
      warnings.push(
        `${row.name}: native and DefiLlama 24h volume differ by ${Math.abs(row.variance24hPct || 0).toFixed(1)}%. Native data is primary and DefiLlama history is excluded.`,
      );
    }
  }

  const sources = [
    defillamaOverview.status,
    defillamaProtocols.status,
    coinGecko.status,
    coinbase.status,
    minswap.status,
    wingriders.status,
    wingridersFees.status,
    poolflowWingridersV1.status,
    sundaeswap.status,
    splash.status,
    muesli.status,
    vyfinance.status,
    dano.status,
    delta.status,
    saturn.status,
  ];

  for (const source of sources) {
    if (source.health === "error") {
      warnings.push(`${source.label}: ${source.message}`);
    }
  }

  return {
    schemaVersion: "1.0",
    mode: "live",
    generatedAt: new Date().toISOString(),
    price: {
      usd: adaUsd,
      timestamp: priceTimestamp,
      source: priceSource,
      endpoint: priceEndpoint,
    },
    aggregates: {
      observed24hUsd: sumAvailable(protocolRows.map((row) => row.volume24hUsd)),
      observed7dUsd: sumAvailable(protocolRows.map((row) => row.volume7dUsd)),
      observed30dUsd: sumAvailable(protocolRows.map((row) => row.volume30dUsd)),
      observedTvlUsd: sumAvailable(protocolRows.map((row) => row.tvlUsd)),
      comparableWeekChangePct: safePercentChange(
        comparableCurrent,
        comparablePrevious,
      ),
      comparableMonthChangePct: null,
      activeDexes: protocolRows.filter((row) => (row.volume24hUsd || 0) > 0).length,
      coverage24h: protocolRows.filter((row) => row.volume24hUsd != null).length,
      coverage7d: protocolRows.filter((row) => row.volume7dUsd != null).length,
      coverage30d: protocolRows.filter((row) => row.volume30dUsd != null).length,
      trackedDexes: protocolRows.length,
      benchmark24hUsd: overview?.total24h ?? null,
      benchmark7dUsd: overview?.total7d ?? null,
      benchmark30dUsd: overview?.total30d ?? null,
      benchmarkTvlUsd: benchmarkTvl,
      benchmarkWeekChangePct: safePercentChange(
        overview?.total7d ?? null,
        overview?.total14dto7d ?? null,
      ),
      benchmarkMonthChangePct: safePercentChange(
        overview?.total30d ?? null,
        overview?.total60dto30d ?? null,
      ),
    },
    dexes: rows,
    benchmarkSeries: buildBenchmarkSeries(overview, configs),
    sources,
    warnings,
  };
}
