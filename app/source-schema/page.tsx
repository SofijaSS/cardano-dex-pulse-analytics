import { redirect } from "next/navigation";
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
  try {
    return await fetchJsonWithRetry(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: ROOT_QUERY }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export default async function SourceSchemaPage() {
  if (!(await hasValidDashboardSession())) redirect("/login");

  const [wingriders, sundaeswap] = await Promise.all([
    inspect("https://api.mainnet.wingriders.com/graphql"),
    inspect(SOURCE_ENDPOINTS.sundaeswap),
  ]);

  return (
    <main style={{ padding: 24 }}>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {JSON.stringify({ wingriders, sundaeswap }, null, 2)}
      </pre>
    </main>
  );
}
