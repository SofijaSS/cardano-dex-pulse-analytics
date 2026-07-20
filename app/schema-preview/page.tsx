import { redirect } from "next/navigation";
import { hasValidDashboardSession } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";

const ENDPOINT =
  "https://api-internal.minswap.org/api/v1/market/dex-analytic?timeframe=1M";

export default async function SchemaPreviewPage() {
  if (!(await hasValidDashboardSession())) redirect("/login");
  const payload = await fetchJsonWithRetry(ENDPOINT);

  return <pre>{JSON.stringify(payload, null, 2)}</pre>;
}
