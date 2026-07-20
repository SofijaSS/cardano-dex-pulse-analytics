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
    volumeInput: __type(name: "VolumeInput") {
      kind
      inputFields {
        name
        defaultValue
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
    }
    baseCurrency: __type(name: "BaseCurrency") {
      kind
      enumValues {
        name
      }
    }
    volumeHistoryInput: __type(name: "VolumeHistoryInput") {
      kind
      inputFields {
        name
        defaultValue
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
    }
    dateIntervalInput: __type(name: "DateIntervalInput") {
      kind
      inputFields {
        name
        defaultValue
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
    protocolStats: __type(name: "ProtocolStats") {
      kind
      fields {
        name
        args {
          name
          defaultValue
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
            ofType {
              kind
              name
            }
          }
        }
      }
    }
  }
`;

const WINGRIDERS_METRICS_QUERY = `
  query DashboardVolume {
    volume24h: volume(input: { lastNHours: 24, baseCurrency: ADA })
    volume7d: volume(input: { lastNHours: 168, baseCurrency: ADA })
    volume14d: volume(input: { lastNHours: 336, baseCurrency: ADA })
    volume30d: volume(input: { lastNHours: 720, baseCurrency: ADA })
    volume60d: volume(input: { lastNHours: 1440, baseCurrency: ADA })
    tvl
    poolsCount
    currentTime
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

  const [wingriders, sundaeswap, wingridersMetrics] = await Promise.all([
    inspect("https://api.mainnet.wingriders.com/graphql"),
    inspect(SOURCE_ENDPOINTS.sundaeswap),
    fetchJsonWithRetry("https://api.mainnet.wingriders.com/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: WINGRIDERS_METRICS_QUERY }),
    }).catch((error) => ({
      error: error instanceof Error ? error.message : "Failed",
    })),
  ]);

  return (
    <main style={{ padding: 24 }}>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {JSON.stringify({ wingriders, sundaeswap, wingridersMetrics }, null, 2)}
      </pre>
    </main>
  );
}
