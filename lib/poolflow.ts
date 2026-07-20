export interface PoolFlowWingRidersPeriod {
  volumeAda: number;
  trades: number | null;
  users: number | null;
  dau: number | null;
  feesAda: number | null;
  tvlAda: number | null;
}

type NumericLeaf = {
  key: string;
  path: string;
  value: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function metricNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/[\s,_₳$]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function collectNumericLeaves(
  value: unknown,
  path: string[] = [],
  depth = 0,
): NumericLeaf[] {
  if (depth > 3 || !isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const normalizedKey = normalize(key);
    const childPath = [...path, normalizedKey];
    const number = metricNumber(child);
    if (number != null) {
      return [{ key: normalizedKey, path: childPath.join(""), value: number }];
    }
    return collectNumericLeaves(child, childPath, depth + 1);
  });
}

function readMetric(record: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalize);
  const leaves = collectNumericLeaves(record);

  for (const alias of normalizedAliases) {
    const exact = leaves.find((leaf) => leaf.key === alias);
    if (exact) return exact.value;
  }
  for (const alias of normalizedAliases) {
    const nested = leaves.find((leaf) => leaf.path.endsWith(alias));
    if (nested) return nested.value;
  }
  return null;
}

function isWingRidersV1Identity(value: string) {
  const normalized = normalize(value);
  return normalized === "wingriders" || normalized === "wingridersv1";
}

function isV2Identity(value: string) {
  const normalized = normalize(value);
  return normalized === "v2" || normalized === "wingridersv2";
}

function collectWingRidersV1Candidates(
  value: unknown,
  parentKey = "",
  depth = 0,
): Record<string, unknown>[] {
  if (depth > 8) return [];
  if (Array.isArray(value)) {
    return value.flatMap((child) =>
      collectWingRidersV1Candidates(child, parentKey, depth + 1),
    );
  }
  if (!isRecord(value)) return [];

  const stringValues = Object.values(value).filter(
    (child): child is string => typeof child === "string",
  );
  const identities = [parentKey, ...stringValues];
  const isWingRiders = identities.some(isWingRidersV1Identity);
  const isV2 = identities.some(isV2Identity);
  const current = isWingRiders && !isV2 ? [value] : [];

  return [
    ...current,
    ...Object.entries(value).flatMap(([key, child]) =>
      collectWingRidersV1Candidates(child, key, depth + 1),
    ),
  ];
}

function parseCandidate(record: Record<string, unknown>) {
  const volumeAda = readMetric(record, [
    "dexVolume",
    "dexVolumeAda",
    "tradingVolume",
    "tradingVolumeAda",
    "totalVolume",
    "volumeAda",
    "volume",
  ]);
  if (volumeAda == null) return null;

  return {
    volumeAda,
    trades: readMetric(record, ["trades", "tradeCount", "transactions"]),
    users: readMetric(record, [
      "users",
      "userCount",
      "uniqueUsers",
      "uniqueWallets",
      "uniqueTraders",
    ]),
    dau: readMetric(record, [
      "dau",
      "dailyActiveUsers",
      "dailyActiveWallets",
      "activeWallets",
    ]),
    feesAda: readMetric(record, [
      "feesAda",
      "generatedFees",
      "totalFees",
      "fees",
    ]),
    tvlAda: readMetric(record, ["tvlAda", "totalValueLocked", "tvl"]),
  } satisfies PoolFlowWingRidersPeriod;
}

export function parsePoolFlowWingRidersV1(
  payload: unknown,
): PoolFlowWingRidersPeriod {
  const candidates = collectWingRidersV1Candidates(payload)
    .map(parseCandidate)
    .filter((candidate): candidate is PoolFlowWingRidersPeriod => candidate !== null)
    .sort((left, right) => {
      const populated = (candidate: PoolFlowWingRidersPeriod) =>
        [candidate.trades, candidate.users, candidate.dau, candidate.feesAda, candidate.tvlAda]
          .filter((value) => value != null).length;
      return populated(right) - populated(left);
    });

  const result = candidates[0];
  if (!result) {
    throw new Error(
      "PoolFlow response did not contain a validated WingRiders V1 market row.",
    );
  }
  return result;
}
