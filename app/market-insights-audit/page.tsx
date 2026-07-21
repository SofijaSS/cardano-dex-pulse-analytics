import { redirect } from "next/navigation";
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

export const dynamic = "force-dynamic";

export default async function MarketInsightsAuditPage() {
  if (!(await hasValidDashboardSession())) redirect("/login");

  const payload = (await fetchJsonWithRetry(
    `${SOURCE_ENDPOINTS.minswapMarketInsights}?timeframe=1M`,
  )) as MarketInsightsPayload;
  const protocol = payload.data?.protocol ?? [];
  const timestamp = payload.data?.timestamp ?? [];
  const volume = payload.data?.vol ?? [];
  const audit = {
    timestamp: timestamp.slice(-2),
    protocols: protocol.map((id, index) => ({
      id,
      volume: volume[index]?.slice(-2) ?? [],
    })),
  };

  return <pre>{JSON.stringify(audit, null, 2)}</pre>;
}
