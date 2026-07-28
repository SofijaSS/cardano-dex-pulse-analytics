import { afterEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  liveLoader: vi.fn(async () => ({ generatedAt: "2026-07-29T00:00:00.000Z" })),
  revalidateTag: vi.fn(),
  unstableCache: vi.fn((load: () => Promise<unknown>) => load),
}));

vi.mock("next/cache", () => ({
  revalidateTag: cacheMocks.revalidateTag,
  unstable_cache: cacheMocks.unstableCache,
}));

vi.mock("@/lib/dashboard-data", () => ({
  loadLiveDashboardData: cacheMocks.liveLoader,
}));

import { serverDataCache } from "../lib/async-data-cache";
import {
  DASHBOARD_SNAPSHOT_CACHE_TAG,
  loadDashboardSnapshot,
} from "../lib/dashboard-snapshot";

afterEach(() => {
  serverDataCache.clear();
  cacheMocks.liveLoader.mockClear();
  cacheMocks.revalidateTag.mockClear();
});

describe("persistent dashboard snapshot", () => {
  it("configures the final Vercel snapshot for hourly revalidation", () => {
    expect(cacheMocks.unstableCache).toHaveBeenCalledWith(
      cacheMocks.liveLoader,
      ["cardano-dex-dashboard-final-v3"],
      {
        revalidate: 3_600,
        tags: [DASHBOARD_SNAPSHOT_CACHE_TAG],
      },
    );
  });

  it("invalidates and reloads the final snapshot on a forced refresh", async () => {
    const result = await loadDashboardSnapshot({ force: true });

    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      DASHBOARD_SNAPSHOT_CACHE_TAG,
      { expire: 0 },
    );
    expect(cacheMocks.liveLoader).toHaveBeenCalledTimes(1);
    expect(result.value).toEqual({
      generatedAt: "2026-07-29T00:00:00.000Z",
    });
  });
});
