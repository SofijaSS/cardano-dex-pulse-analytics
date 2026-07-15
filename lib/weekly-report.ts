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
    topThree.find((dex) => dex.id === "wingriders") ||
    topThree[0] ||
    null;
  const observed7d = ranked.reduce(
    (sum, dex) => sum + (dex.volume7dUsd || 0),
    0,
  );
  const share7d =
    selectedDex?.volume7dUsd != null && observed7d > 0
      ? (selectedDex.volume7dUsd / observed7d) * 100
      : null;
  const difference =
    selectedDex?.volume7dUsd != null && selectedDex.previous7dUsd != null
      ? selectedDex.volume7dUsd - selectedDex.previous7dUsd
      : null;
  const rank = selectedDex
    ? ranked.findIndex((dex) => dex.id === selectedDex.id) + 1
    : null;

  return { topThree, selectedDex, share7d, difference, rank };
}
