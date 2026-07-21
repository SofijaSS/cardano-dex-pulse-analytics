import { redirect } from "next/navigation";
import { hasValidDashboardSession, isDashboardAuthEnabled } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";

export const dynamic = "force-dynamic";

const introspection = `query SourceAudit {
  __schema {
    queryType { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } }
    types { name fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } }
  }
}`;

export default async function SourceAuditPage() {
  if (isDashboardAuthEnabled() && !(await hasValidDashboardSession())) redirect("/login");
  const [sundae, poolflow, minswapV1, minswapV2] = await Promise.allSettled([
    fetchJsonWithRetry(SOURCE_ENDPOINTS.sundaeswap, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: introspection }),
    }),
    fetchJsonWithRetry(`${SOURCE_ENDPOINTS.poolflowMarkets}?days=1`),
    ...(["Minswap", "MinswapV2"] as const).map((protocol) =>
      fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          limit: 3,
          only_verified: false,
          protocols: [protocol],
          sort_direction: "desc",
          sort_field: "volume_24h",
          currency: "usd",
        }),
      }),
    ),
  ]);
  const value = (result: PromiseSettledResult<unknown>) =>
    result.status === "fulfilled"
      ? result.value
      : { error: result.reason instanceof Error ? result.reason.message : "Failed" };
  const sundaePayload = value(sundae) as { data?: { __schema?: { queryType?: unknown; types?: Array<{ name?: string; fields?: Array<{ name?: string }> }> } }; errors?: unknown };
  const schema = sundaePayload.data?.__schema;
  const relevantTypes = schema?.types?.filter((type) => {
    const text = `${type.name ?? ""} ${(type.fields ?? []).map((field) => field.name ?? "").join(" ")}`;
    return /stat|volume|trade|swap|transaction|pool/i.test(text);
  });
  const payload = {
    sundae: { queryType: schema?.queryType, relevantTypes, errors: sundaePayload.errors },
    poolflow: value(poolflow),
    minswapV1: value(minswapV1),
    minswapV2: value(minswapV2),
  };

  return <pre style={{ whiteSpace: "pre-wrap", padding: 24 }}>{JSON.stringify(payload, null, 2)}</pre>;
}
