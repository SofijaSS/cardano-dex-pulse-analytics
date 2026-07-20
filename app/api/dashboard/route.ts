import { revalidateTag } from "next/cache";
import { loadDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { DATA_CACHE_SECONDS } from "@/lib/source-config";
import { DASHBOARD_SOURCE_CACHE_TAG } from "@/lib/source-snapshot-cache";
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
    const force = url.searchParams.get("force") === "1";
    if (force) revalidateTag(DASHBOARD_SOURCE_CACHE_TAG, { expire: 0 });
    const cached = await loadDashboardSnapshot({ force });

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
