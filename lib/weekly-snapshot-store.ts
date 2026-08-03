import { unstable_cache } from "next/cache";
import {
  insertWeeklyReportingSnapshot,
  readWeeklyReportingSnapshot,
} from "@/db/weekly-reporting";
import { loadDashboardSnapshot } from "@/lib/dashboard-snapshot";
import type { DashboardData } from "@/lib/types";
import {
  applyWeeklyReportingSnapshots,
  buildWeeklyReportingSnapshot,
  getSeededWeeklySnapshot,
  latestReportingWeekKey,
  previousReportingWeekKey,
  type WeeklyReportingSnapshot,
} from "@/lib/weekly-reporting";

export const WEEKLY_REPORTING_CACHE_TAG = "weekly-reporting-snapshots";

const loadVercelWeeklySnapshot = unstable_cache(
  async (weekKey: string) => {
    if (weekKey !== latestReportingWeekKey()) {
      throw new Error(`Weekly reporting snapshot ${weekKey} is unavailable.`);
    }
    const dashboard = await loadDashboardSnapshot();
    return buildWeeklyReportingSnapshot(dashboard.value, weekKey);
  },
  ["cardano-dex-weekly-reporting-v1"],
  {
    revalidate: false,
    tags: [WEEKLY_REPORTING_CACHE_TAG],
  },
);

async function readStoredSnapshot(weekKey: string) {
  const seeded = getSeededWeeklySnapshot(weekKey);
  if (seeded) return seeded;
  const d1Snapshot = await readWeeklyReportingSnapshot(weekKey);
  if (d1Snapshot !== undefined) return d1Snapshot;
  try {
    return await loadVercelWeeklySnapshot(weekKey);
  } catch {
    return null;
  }
}

export async function captureWeeklyReportingSnapshot(
  dashboard: DashboardData,
  weekKey = latestReportingWeekKey(),
  capturedAt = new Date(),
) {
  const seeded = getSeededWeeklySnapshot(weekKey);
  if (seeded) return seeded;
  const existing = await readWeeklyReportingSnapshot(weekKey);
  if (existing) return existing;
  const snapshot = buildWeeklyReportingSnapshot(dashboard, weekKey, capturedAt);
  const d1Snapshot = await insertWeeklyReportingSnapshot(snapshot);
  if (d1Snapshot) return d1Snapshot;
  return loadVercelWeeklySnapshot(weekKey);
}

export async function withWeeklyReporting(
  dashboard: DashboardData,
  now = new Date(),
) {
  const currentWeekKey = latestReportingWeekKey(now);
  const current =
    (await readStoredSnapshot(currentWeekKey)) ??
    (await captureWeeklyReportingSnapshot(dashboard, currentWeekKey, now));
  if (!current) {
    return {
      ...dashboard,
      warnings: [
        ...dashboard.warnings,
        `Weekly reporting snapshot ${currentWeekKey} is unavailable. Rolling provider periods remain visible.`,
      ],
    };
  }
  const previous = await readStoredSnapshot(
    previousReportingWeekKey(currentWeekKey),
  );
  return applyWeeklyReportingSnapshots(
    dashboard,
    current,
    previous as WeeklyReportingSnapshot | null,
  );
}
