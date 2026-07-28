import { serverDataCache } from "@/lib/async-data-cache";
import { loadLiveDashboardData } from "@/lib/dashboard-data";
import {
  acquireDashboardRefreshLease,
  getDashboardSnapshotDatabase,
  isDashboardSnapshotUsable,
  readDashboardSnapshot,
  recordDashboardRefreshFailure,
  writeDashboardSnapshot,
} from "@/lib/dashboard-snapshot-store";
import { buildMockDashboardData } from "@/lib/mock-data";
import {
  DATA_CACHE_SECONDS,
  DATA_STALE_SECONDS,
  USE_MOCK_DATA,
} from "@/lib/source-config";
import type { DataCacheResult } from "@/lib/async-data-cache";
import type { DashboardData } from "@/lib/types";

export type DashboardSnapshotResult = DataCacheResult<DashboardData> & {
  refreshInBackground: boolean;
};

function loadComputedDashboardSnapshot({ force = false } = {}) {
  return serverDataCache.get(
    USE_MOCK_DATA ? "dashboard:mock" : "dashboard:live:v2",
    async () => USE_MOCK_DATA ? buildMockDashboardData() : loadLiveDashboardData(),
    {
      force,
      ttlMs: DATA_CACHE_SECONDS * 1_000,
      staleForMs: DATA_STALE_SECONDS * 1_000,
    },
  );
}

export function dashboardSnapshotNeedsRefresh(
  updatedAt: number,
  now = Date.now(),
) {
  return now - updatedAt >= DATA_CACHE_SECONDS * 1_000;
}

export async function refreshDashboardSnapshot({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<DashboardSnapshotResult> {
  const database = getDashboardSnapshotDatabase();
  if (USE_MOCK_DATA || !database) {
    const computed = await loadComputedDashboardSnapshot({ force });
    return { ...computed, refreshInBackground: false };
  }

  const previous = await readDashboardSnapshot(database);
  const acquired = await acquireDashboardRefreshLease(database);
  if (!acquired && previous) {
    return {
      status: "shared",
      value: previous.value,
      refreshInBackground: false,
    };
  }

  try {
    const computed = await loadComputedDashboardSnapshot({ force });
    if (!isDashboardSnapshotUsable(computed.value)) {
      throw new Error("Dashboard refresh did not return a usable source snapshot.");
    }
    await writeDashboardSnapshot(computed.value, database);
    return {
      status: previous ? "refresh" : "miss",
      value: computed.value,
      refreshInBackground: false,
    };
  } catch (error) {
    await recordDashboardRefreshFailure(error, database);
    if (previous) {
      return {
        status: "stale",
        value: previous.value,
        refreshInBackground: false,
      };
    }
    throw error;
  }
}

export async function loadDashboardSnapshot({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<DashboardSnapshotResult> {
  const database = getDashboardSnapshotDatabase();
  if (USE_MOCK_DATA || !database) {
    const computed = await loadComputedDashboardSnapshot({ force });
    return { ...computed, refreshInBackground: false };
  }

  const stored = await readDashboardSnapshot(database);
  if (!stored) return refreshDashboardSnapshot({ force });

  const refreshInBackground =
    force || dashboardSnapshotNeedsRefresh(stored.updatedAt);

  return {
    status: refreshInBackground ? "stale" : "hit",
    value: stored.value,
    refreshInBackground,
  };
}
