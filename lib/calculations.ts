export function safePercentChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }

  return numerator / denominator;
}

export function safePercentageShares(
  values: Array<number | null | undefined>,
): Array<number | null> {
  const positiveValues = values.map((value) =>
    value != null && Number.isFinite(value) && value > 0 ? value : null,
  );
  const total = positiveValues.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );

  if (total <= 0) return values.map(() => null);
  return positiveValues.map((value) =>
    value == null ? null : (value / total) * 100,
  );
}

export function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CumulativeVolumeIssue =
  | "invalid-24h"
  | "invalid-7d"
  | "invalid-30d"
  | "7d-below-24h"
  | "30d-below-24h"
  | "30d-below-7d";

export function nonNegativeFiniteOrNull(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function derivePreviousRollingPeriod(
  combinedPeriod: number | null | undefined,
  currentPeriod: number | null | undefined,
) {
  const combined = nonNegativeFiniteOrNull(combinedPeriod);
  const current = nonNegativeFiniteOrNull(currentPeriod);
  if (combined == null || current == null || combined < current) return null;
  return combined - current;
}

export function validateCumulativeVolumes(
  volume24h: number | null | undefined,
  volume7d: number | null | undefined,
  volume30d: number | null | undefined,
) {
  const issues: CumulativeVolumeIssue[] = [];
  const validated24h = nonNegativeFiniteOrNull(volume24h);
  let validated7d = nonNegativeFiniteOrNull(volume7d);
  let validated30d = nonNegativeFiniteOrNull(volume30d);

  if (volume24h != null && validated24h == null) issues.push("invalid-24h");
  if (volume7d != null && validated7d == null) issues.push("invalid-7d");
  if (volume30d != null && validated30d == null) issues.push("invalid-30d");

  if (
    validated7d != null &&
    validated24h != null &&
    validated7d < validated24h
  ) {
    validated7d = null;
    issues.push("7d-below-24h");
  }

  if (
    validated30d != null &&
    validated24h != null &&
    validated30d < validated24h
  ) {
    validated30d = null;
    issues.push("30d-below-24h");
  } else if (
    validated30d != null &&
    validated7d != null &&
    validated30d < validated7d
  ) {
    validated30d = null;
    issues.push("30d-below-7d");
  }

  return {
    volume24h: validated24h,
    volume7d: validated7d,
    volume30d: validated30d,
    issues,
  };
}

export function sumAvailable(values: Array<number | null | undefined>) {
  const available = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

export function variancePct(
  nativeValue: number | null,
  benchmarkValue: number | null,
) {
  return safePercentChange(nativeValue, benchmarkValue);
}

export function classifySourceQuality(
  nativeValue: number | null,
  benchmarkValue: number | null,
) {
  if (nativeValue == null && benchmarkValue == null) return "unavailable" as const;
  if (nativeValue == null) return "benchmark-only" as const;
  if (benchmarkValue == null) return "native-only" as const;
  if (nativeValue === 0 && benchmarkValue === 0) return "aligned" as const;

  const variance = variancePct(nativeValue, benchmarkValue);
  return variance != null && Math.abs(variance) <= 20
    ? ("aligned" as const)
    : ("material-variance" as const);
}

export function validateUsdAdaPair(
  usdValue: number | null,
  adaValue: number | null,
  referenceAdaUsd: number | null,
  tolerancePct = 5,
) {
  const impliedAdaUsd = safeDivide(usdValue, adaValue);
  const deviationPct = safePercentChange(impliedAdaUsd, referenceAdaUsd);

  if (impliedAdaUsd == null || deviationPct == null) {
    return { status: "unavailable" as const, impliedAdaUsd, deviationPct };
  }

  return {
    status:
      Math.abs(deviationPct) <= tolerancePct
        ? ("aligned" as const)
        : ("mismatch" as const),
    impliedAdaUsd,
    deviationPct,
  };
}
