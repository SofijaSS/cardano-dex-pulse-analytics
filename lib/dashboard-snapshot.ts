import { serverDataCache } from "@/lib/async-data-cache";
import { loadLiveDashboardData } from "@/lib/dashboard-data";
import { buildMockDashboardData } from "@/lib/mock-data";
import {
  DATA_CACHE_SECONDS,
  DATA_STALE_SECONDS,
  USE_MOCK_DATA,
} from "@/lib/source-config";

export function loadDashboardSnapshot({ force = false } = {}) {
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
