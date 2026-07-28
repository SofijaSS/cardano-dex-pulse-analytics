import { revalidateTag, unstable_cache } from "next/cache";
import { serverDataCache } from "@/lib/async-data-cache";
import { loadLiveDashboardData } from "@/lib/dashboard-data";
import { buildMockDashboardData } from "@/lib/mock-data";
import {
  DATA_CACHE_SECONDS,
  DATA_STALE_SECONDS,
  USE_MOCK_DATA,
} from "@/lib/source-config";

export const DASHBOARD_SNAPSHOT_CACHE_TAG = "dashboard-final-snapshot";

const loadPersistentLiveDashboardSnapshot = unstable_cache(
  loadLiveDashboardData,
  ["cardano-dex-dashboard-final-v3"],
  {
    revalidate: DATA_CACHE_SECONDS,
    tags: [DASHBOARD_SNAPSHOT_CACHE_TAG],
  },
);

export function loadDashboardSnapshot({ force = false } = {}) {
  if (force && !USE_MOCK_DATA) {
    revalidateTag(DASHBOARD_SNAPSHOT_CACHE_TAG, { expire: 0 });
  }

  return serverDataCache.get(
    USE_MOCK_DATA ? "dashboard:mock" : "dashboard:live:v3",
    async () =>
      USE_MOCK_DATA
        ? buildMockDashboardData()
        : loadPersistentLiveDashboardSnapshot(),
    {
      force,
      ttlMs: DATA_CACHE_SECONDS * 1_000,
      staleForMs: DATA_STALE_SECONDS * 1_000,
    },
  );
}
