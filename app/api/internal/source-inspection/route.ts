/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import { hasValidDashboardSession } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";

const ENDPOINT =
  "https://api-internal.minswap.org/api/v1/market/dex-analytic?timeframe=1M";

export async function GET() {
  if (!(await hasValidDashboardSession())) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }

  try {
    return Response.json(await fetchJsonWithRetry(ENDPOINT), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Source request failed." },
      { status: 502, headers: { "cache-control": "private, no-store" } },
    );
  }
}
