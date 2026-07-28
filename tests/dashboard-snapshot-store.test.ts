import { afterEach, describe, expect, it } from "vitest";
import {
  acquireDashboardRefreshLease,
  type DashboardSnapshotDatabase,
  isDashboardSnapshotUsable,
  readDashboardSnapshot,
  registerDashboardSnapshotDatabase,
  writeDashboardSnapshot,
} from "../lib/dashboard-snapshot-store";
import { dashboardSnapshotNeedsRefresh } from "../lib/dashboard-snapshot";
import type { DashboardData } from "../lib/types";

type StoredRow = {
  generated_at: string | null;
  last_error: string | null;
  payload_json: string | null;
  refresh_lease_until: number;
  updated_at: number;
};

class FakeStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: FakeDatabase,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.database.row ? { ...this.database.row } : null) as T | null;
  }

  async run() {
    if (this.query.includes("INSERT OR IGNORE")) {
      this.database.row ||= {
        generated_at: null,
        last_error: null,
        payload_json: null,
        refresh_lease_until: 0,
        updated_at: 0,
      };
      return { meta: { changes: 1 } };
    }

    if (this.query.includes("last_attempt_at = ?")) {
      const [leaseUntil, , , now] = this.values as number[];
      if (
        this.database.row &&
        this.database.row.refresh_lease_until <= now
      ) {
        this.database.row.refresh_lease_until = leaseUntil;
        this.database.row.last_error = null;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (this.query.includes("payload_json = ?")) {
      const [payload, generatedAt, updatedAt] = this.values as [
        string,
        string,
        number,
      ];
      if (this.database.row) {
        this.database.row.payload_json = payload;
        this.database.row.generated_at = generatedAt;
        this.database.row.updated_at = updatedAt;
        this.database.row.refresh_lease_until = 0;
        this.database.row.last_error = null;
      }
      return { meta: { changes: this.database.row ? 1 : 0 } };
    }

    if (this.query.includes("last_error = ?")) {
      const [message] = this.values as [string];
      if (this.database.row) {
        this.database.row.refresh_lease_until = 0;
        this.database.row.last_error = message;
      }
      return { meta: { changes: this.database.row ? 1 : 0 } };
    }

    throw new Error(`Unexpected SQL in test: ${this.query}`);
  }
}

class FakeDatabase implements DashboardSnapshotDatabase {
  row: StoredRow | null = null;

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch(statements: FakeStatement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function dashboardData(): DashboardData {
  const generatedAt = "2026-07-28T20:00:00.000Z";
  return {
    schemaVersion: "1.0",
    mode: "live",
    generatedAt,
    price: {
      usd: 0.5,
      timestamp: generatedAt,
      source: "CoinGecko",
      endpoint: "https://example.com/price",
    },
    aggregates: {
      observed24hUsd: 100,
      observed7dUsd: 700,
      observed30dUsd: 3_000,
      observedTvlUsd: 10_000,
      comparableWeekChangePct: 5,
      comparableMonthChangePct: null,
      activeDexes: 1,
      coverage24h: 1,
      coverage7d: 1,
      coverage30d: 1,
      trackedDexes: 1,
      benchmark24hUsd: 90,
      benchmark7dUsd: 650,
      benchmark30dUsd: 2_900,
      benchmarkTvlUsd: 9_500,
      benchmarkWeekChangePct: 4,
      benchmarkMonthChangePct: null,
    },
    dexes: [
      {
        id: "dex",
        name: "DEX",
        rowKind: "protocol",
        tableRole: "primary",
        parentId: null,
        protocolVersion: null,
        logo: null,
        color: "#000",
        volume24hUsd: 100,
        volume7dUsd: 700,
        volume30dUsd: 3_000,
        previous7dUsd: 670,
        weekChangePct: 5,
        tvlUsd: 10_000,
        volumeToTvl: 0.01,
        marketShare24hPct: 100,
        rank7d: 1,
        trades24h: null,
        users24h: null,
        dau24h: null,
        fees24hUsd: null,
        fees7dUsd: null,
        marketCapUsd: null,
        marketCapToTvl: null,
        poolCount: null,
        nativeVolume24hUsd: 100,
        defillamaVolume24hUsd: 90,
        defillamaVolume7dUsd: 650,
        defillamaVolume30dUsd: 2_900,
        defillamaPrevious7dUsd: 625,
        variance24hPct: 11.1,
        quality: "aligned",
        sourceLabel: "Native",
        sourceUrl: "https://example.com/dex",
        periodNote: "Verified.",
        lastDataAt: generatedAt,
      },
    ],
    benchmarkSeries: [],
    sources: [
      {
        id: "native",
        label: "Native",
        endpoint: "https://example.com/dex",
        health: "healthy",
        fetchedAt: generatedAt,
        dataAt: generatedAt,
        expectedUpdateMinutes: 60,
        message: "Source responded successfully.",
      },
    ],
    warnings: [],
  };
}

afterEach(() => {
  registerDashboardSnapshotDatabase(null);
});

describe("durable dashboard snapshot", () => {
  it("uses a lease to deduplicate refreshes across workers", async () => {
    const database = new FakeDatabase();

    await expect(acquireDashboardRefreshLease(database, 1_000)).resolves.toBe(true);
    await expect(acquireDashboardRefreshLease(database, 1_001)).resolves.toBe(false);
    await expect(acquireDashboardRefreshLease(database, 121_001)).resolves.toBe(true);
  });

  it("round-trips the last usable snapshot", async () => {
    const database = new FakeDatabase();
    const value = dashboardData();

    await acquireDashboardRefreshLease(database, 1_000);
    await writeDashboardSnapshot(value, database, 2_000);

    await expect(readDashboardSnapshot(database)).resolves.toEqual({
      generatedAt: value.generatedAt,
      lastError: null,
      refreshLeaseUntil: 0,
      updatedAt: 2_000,
      value,
    });
  });

  it("refuses to replace the snapshot with unusable data", async () => {
    const database = new FakeDatabase();
    const value = dashboardData();
    await acquireDashboardRefreshLease(database, 1_000);
    await writeDashboardSnapshot(value, database, 2_000);

    const unusable = {
      ...value,
      dexes: [],
      sources: value.sources.map((source) => ({ ...source, health: "error" as const })),
    };

    expect(isDashboardSnapshotUsable(unusable)).toBe(false);
    await expect(writeDashboardSnapshot(unusable, database, 3_000))
      .rejects.toThrow("Refusing to replace");
    await expect(readDashboardSnapshot(database))
      .resolves.toMatchObject({ updatedAt: 2_000, value });
  });

  it("refreshes the final snapshot once per hour", () => {
    expect(dashboardSnapshotNeedsRefresh(1_000, 3_600_999)).toBe(false);
    expect(dashboardSnapshotNeedsRefresh(1_000, 3_601_000)).toBe(true);
  });
});
