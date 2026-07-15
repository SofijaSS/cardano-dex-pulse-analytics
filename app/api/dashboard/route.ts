import { loadLiveDashboardData } from "@/lib/dashboard-data";
import { buildMockDashboardData } from "@/lib/mock-data";
import { DATA_CACHE_SECONDS, USE_MOCK_DATA } from "@/lib/source-config";

export async function GET() {
  try {
    const data = USE_MOCK_DATA
      ? buildMockDashboardData()
      : await loadLiveDashboardData();

    return Response.json(data, {
      headers: {
        "cache-control": `public, max-age=60, s-maxage=${DATA_CACHE_SECONDS}, stale-while-revalidate=300`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Dashboard data could not be loaded.",
        detail: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 503 },
    );
  }
}
