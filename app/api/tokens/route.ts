import { revalidateTag, unstable_cache } from "next/cache";
import { getDexToken } from "@/config/tokens";
import { serverDataCache } from "@/lib/async-data-cache";
import { hasValidDashboardSession, isDashboardAuthEnabled } from "@/lib/auth";
import { loadTokenAnalytics, TOKEN_RANGE_CONFIG } from "@/lib/token-data";
import { DATA_STALE_SECONDS, TOKEN_CACHE_SECONDS } from "@/lib/source-config";
import { TOKEN_SOURCE_CACHE_TAG, tokenCacheTag } from "@/lib/source-snapshot-cache";
import type { TokenChartRange } from "@/lib/token-types";

export async function GET(request: Request) {
  if (!(await hasValidDashboardSession())) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }

  const url = new URL(request.url);
  const token = getDexToken(url.searchParams.get("token") || "wrt");
  const rangeValue = url.searchParams.get("range") || "30d";
  const range = rangeValue in TOKEN_RANGE_CONFIG
    ? rangeValue as TokenChartRange
    : null;
  if (!token || !range) {
    return Response.json(
      { error: "Unknown token or chart range." },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }

  try {
    const force = url.searchParams.get("force") === "1";
    if (force) revalidateTag(tokenCacheTag(token.id), { expire: 0 });
    const cached = await serverDataCache.get(
      `token:${token.id}:${range}:v2`,
      () => unstable_cache(
        () => loadTokenAnalytics(token, range),
        ["cardano-token-source-v2", token.id, range],
        {
          revalidate: TOKEN_CACHE_SECONDS,
          tags: [TOKEN_SOURCE_CACHE_TAG, tokenCacheTag(token.id)],
        },
      )(),
      {
        force,
        ttlMs: TOKEN_CACHE_SECONDS * 1_000,
        staleForMs: DATA_STALE_SECONDS * 1_000,
      },
    );
    return Response.json(cached.value, {
      headers: {
        "x-data-cache": cached.status,
        "cache-control": isDashboardAuthEnabled()
          ? "private, no-store"
          : "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Token analytics could not be loaded.",
        detail: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
