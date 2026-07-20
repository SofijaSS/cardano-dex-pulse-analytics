import { unstable_cache } from "next/cache";
import {
  BENCHMARK_REFRESH_SECONDS,
  DEX_REFRESH_SECONDS,
  PRICE_REFRESH_SECONDS,
} from "@/lib/source-config";

export const DASHBOARD_SOURCE_CACHE_TAG = "dashboard-sources";
export const TOKEN_SOURCE_CACHE_TAG = "token-sources";

const PRICE_SOURCE_IDS = new Set(["coingecko-price", "coinbase-price"]);
const BENCHMARK_SOURCE_IDS = new Set([
  "defillama-volume",
  "muesliswap-native",
  "dano-native",
  "delta-native",
  "saturn-native",
]);

export function sourceRefreshSeconds(sourceId: string) {
  if (PRICE_SOURCE_IDS.has(sourceId)) return PRICE_REFRESH_SECONDS;
  if (BENCHMARK_SOURCE_IDS.has(sourceId)) return BENCHMARK_REFRESH_SECONDS;
  return DEX_REFRESH_SECONDS;
}
export function sourceCacheTag(sourceId: string) {
  return `dashboard-source-${sourceId}`;
}

export async function loadCachedSource<T>({
  endpoint,
  load,
  sourceId,
}: {
  endpoint: string;
  load: () => Promise<T>;
  sourceId: string;
}) {
  const cachedLoad = unstable_cache(
    load,
    ["cardano-dex-source-v2", sourceId, endpoint],
    {
      revalidate: sourceRefreshSeconds(sourceId),
      tags: [DASHBOARD_SOURCE_CACHE_TAG, sourceCacheTag(sourceId)],
    },
  );

  return cachedLoad();
}

export function tokenCacheTag(tokenId: string) {
  return `token-source-${tokenId}`;
}
