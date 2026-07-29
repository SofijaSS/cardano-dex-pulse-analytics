import { z } from "zod";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import {
  DELTA_FETCH_ATTEMPTS,
  DELTA_FETCH_TIMEOUT_MS,
} from "@/lib/source-config";

const deltaDailyVolumeSchema = z.object({
  volume_usd: z.number().finite().nonnegative(),
});

export const DELTA_KNOWN_LIMITATION =
  "Known limitation: DeltaDeFi's public metrics endpoint is currently unreliable. The last successful cached snapshot is retained when available; without one, DeltaDeFi is excluded from active source coverage.";

export function deltaDailyVolumeUrl(endpoint: string, timestamp: number) {
  const url = new URL(endpoint);
  url.searchParams.set("timestamp", String(Math.floor(timestamp / 1_000)));
  return url.toString();
}

export async function loadDeltaDailyVolume(
  endpoint: string,
  timestamp: number,
  {
    attempts = DELTA_FETCH_ATTEMPTS,
    timeoutMs = DELTA_FETCH_TIMEOUT_MS,
  }: {
    attempts?: number;
    timeoutMs?: number;
  } = {},
) {
  return deltaDailyVolumeSchema.parse(
    await fetchJsonWithRetry(
      deltaDailyVolumeUrl(endpoint, timestamp),
      {},
      { attempts, timeoutMs },
    ),
  );
}
