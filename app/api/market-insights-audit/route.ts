import { hasValidDashboardSession } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";

type MarketInsightsPayload = {
  data?: {
    timestamp?: number[];
    protocol?: string[];
    vol?: number[][];
  };
};

export async function GET() {
  if (!(await hasValidDashboardSession())) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await fetchJsonWithRetry(
    `${SOURCE_ENDPOINTS.minswapMarketInsights}?timeframe=1M`,
  )) as MarketInsightsPayload;
  const protocol = payload.data?.protocol ?? [];
  const timestamp = payload.data?.timestamp ?? [];
  const volume = payload.data?.vol ?? [];

  return Response.json({
    timestamp: timestamp.slice(-2),
    protocols: protocol.map((id, index) => ({
      id,
      volume: volume[index]?.slice(-2) ?? [],
    })),
  }, { headers: { "cache-control": "private, no-store" } });
}
