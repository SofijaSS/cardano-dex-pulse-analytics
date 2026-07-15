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

export function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
