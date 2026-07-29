import type { DexMetric } from "@/lib/types";

export function buildWeeklyReportModel(
  dexes: DexMetric[],
  selectedDexId: string | null,
) {
  const ranked = [...dexes]
    .filter((dex) => dex.volume7dUsd != null)
    .sort((left, right) =>
      (right.volume7dUsd || 0) - (left.volume7dUsd || 0) ||
      left.name.localeCompare(right.name),
    );
  const topThree = ranked.slice(0, 3);
  const selectedDex =
    topThree.find((dex) => dex.id === selectedDexId) ||
    topThree[0] ||
    null;
  const rank = selectedDex
    ? ranked.findIndex((dex) => dex.id === selectedDex.id) + 1
    : null;

  return { topThree, selectedDex, rank };
}
