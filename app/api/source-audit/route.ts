import { hasValidDashboardSession } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";

const SUNDAE_INTROSPECTION_QUERY = `
  query SourceAudit {
    __schema {
      queryType {
        fields {
          name
          args { name type { kind name ofType { kind name } } }
          type { kind name ofType { kind name } }
        }
      }
      types {
        name
        fields {
          name
          args { name type { kind name ofType { kind name } } }
          type { kind name ofType { kind name } }
        }
      }
    }
  }
`;

export async function GET() {
  if (!(await hasValidDashboardSession())) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const [sundae, poolflow, minswapV1, minswapV2] = await Promise.allSettled([
    fetchJsonWithRetry(SOURCE_ENDPOINTS.sundaeswap, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: SUNDAE_INTROSPECTION_QUERY }),
    }),
    fetchJsonWithRetry(`${SOURCE_ENDPOINTS.poolflowMarkets}?days=1`),
    fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        limit: 3,
        only_verified: false,
        protocols: ["Minswap"],
        sort_direction: "desc",
        sort_field: "volume_24h",
        currency: "usd",
      }),
    }),
    fetchJsonWithRetry(SOURCE_ENDPOINTS.minswapPools, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        limit: 3,
        only_verified: false,
        protocols: ["MinswapV2"],
        sort_direction: "desc",
        sort_field: "volume_24h",
        currency: "usd",
      }),
    }),
  ]);

  const settled = (result: PromiseSettledResult<unknown>) =>
    result.status === "fulfilled"
      ? result.value
      : { error: result.reason instanceof Error ? result.reason.message : "Failed" };
  const sundaePayload = settled(sundae) as Record<string, unknown>;
  const schema = (sundaePayload.data as Record<string, unknown> | undefined)
    ?.__schema as { types?: Array<{ name?: string; fields?: Array<{ name?: string }> }> } | undefined;
  const relevantTypes = schema?.types?.filter((type) => {
    const text = `${type.name ?? ""} ${(type.fields ?? []).map((field) => field.name ?? "").join(" ")}`;
    return /stat|volume|trade|swap|transaction|pool/i.test(text);
  });

  return Response.json({
    sundae: {
      queryType: (schema as { queryType?: unknown } | undefined)?.queryType,
      relevantTypes,
      errors: sundaePayload.errors,
    },
    poolflow: settled(poolflow),
    minswapV1: settled(minswapV1),
    minswapV2: settled(minswapV2),
  }, { headers: { "cache-control": "private, no-store" } });
}
