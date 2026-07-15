import { getDexToken } from "@/config/tokens";
import { hasValidDashboardSession, isDashboardAuthEnabled } from "@/lib/auth";
import { loadTokenAnalytics, TOKEN_RANGE_CONFIG } from "@/lib/token-data";
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
    return Response.json(await loadTokenAnalytics(token, range), {
      headers: {
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
