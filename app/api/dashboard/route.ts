import { loadLiveDashboardData } from "@/lib/dashboard-data";
import { buildMockDashboardData } from "@/lib/mock-data";
import { serverDataCache } from "@/lib/async-data-cache";
import {
  DATA_CACHE_SECONDS,
  DATA_STALE_SECONDS,
  USE_MOCK_DATA,
} from "@/lib/source-config";
import {
  hasValidDashboardSession,
  isDashboardAuthEnabled,
} from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await hasValidDashboardSession())) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request");
    const force = requestId != null && requestId !== "0";
    const cached = await serverDataCache.get(
      USE_MOCK_DATA ? "dashboard:mock" : "dashboard:live",
      async () => USE_MOCK_DATA ? buildMockDashboardData() : loadLiveDashboardData(),
      {
        force,
        ttlMs: DATA_CACHE_SECONDS * 1_000,
        staleForMs: DATA_STALE_SECONDS * 1_000,
      },
    );

    return Response.json(cached.value, {
      headers: {
        "x-data-cache": cached.status,
        "cache-control": isDashboardAuthEnabled()
          ? "private, no-store"
          : `public, max-age=60, s-maxage=${DATA_CACHE_SECONDS}, stale-while-revalidate=300`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Dashboard data could not be loaded.",
        detail: error instanceof Error ? error.message : "Unknown server error",
      },
      {
        status: 503,
        headers: {
          "cache-control": isDashboardAuthEnabled()
            ? "private, no-store"
            : "no-store",
        },
      },
    );
  }
}
