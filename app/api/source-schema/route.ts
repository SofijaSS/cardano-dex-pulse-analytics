import { hasValidDashboardSession } from "@/lib/auth";
import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { SOURCE_ENDPOINTS } from "@/lib/source-config";

const ROOT_QUERY = `
  query SourceSchema {
    __type(name: "Query") {
      fields {
        name
        args {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
`;

async function inspect(endpoint: string) {
  return fetchJsonWithRetry(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: ROOT_QUERY }),
  });
}

export async function GET() {
  if (!(await hasValidDashboardSession())) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }

  const [wingriders, sundaeswap] = await Promise.allSettled([
    inspect("https://api.mainnet.wingriders.com/graphql"),
    inspect(SOURCE_ENDPOINTS.sundaeswap),
  ]);

  return Response.json(
    {
      wingriders:
        wingriders.status === "fulfilled"
          ? wingriders.value
          : { error: wingriders.reason instanceof Error ? wingriders.reason.message : "Failed" },
      sundaeswap:
        sundaeswap.status === "fulfilled"
          ? sundaeswap.value
          : { error: sundaeswap.reason instanceof Error ? sundaeswap.reason.message : "Failed" },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
