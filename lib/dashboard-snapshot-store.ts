import type { DashboardData } from "@/lib/types";

const DASHBOARD_SNAPSHOT_ID = "dashboard:live:v3";
const DASHBOARD_REFRESH_LEASE_MS = 2 * 60_000;
const RUNTIME_DATABASE_KEY = "__cardanoDexDashboardSnapshotDatabase";

type D1RunResult = {
  meta?: {
    changes?: number;
  };
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
};

export type DashboardSnapshotDatabase = {
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>;
  prepare(query: string): D1PreparedStatement;
};

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_DATABASE_KEY]?: DashboardSnapshotDatabase;
};

type DashboardSnapshotRow = {
  generated_at: string | null;
  last_error: string | null;
  payload_json: string | null;
  refresh_lease_until: number;
  updated_at: number;
};

export type StoredDashboardSnapshot = {
  generatedAt: string;
  lastError: string | null;
  refreshLeaseUntil: number;
  updatedAt: number;
  value: DashboardData;
};

export function registerDashboardSnapshotDatabase(
  database: DashboardSnapshotDatabase | null | undefined,
) {
  const runtime = globalThis as RuntimeGlobal;
  if (database) runtime[RUNTIME_DATABASE_KEY] = database;
  else delete runtime[RUNTIME_DATABASE_KEY];
}

export function getDashboardSnapshotDatabase() {
  return (globalThis as RuntimeGlobal)[RUNTIME_DATABASE_KEY] || null;
}

export function isDashboardSnapshotUsable(value: DashboardData) {
  if (
    value.schemaVersion !== "1.0" ||
    !Number.isFinite(new Date(value.generatedAt).getTime()) ||
    !Array.isArray(value.dexes) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.benchmarkSeries)
  ) {
    return false;
  }

  const hasHealthySource = value.sources.some(
    (source) => source.health === "healthy" || source.health === "stale",
  );
  const hasObservedMetric = value.dexes.some((dex) =>
    [
      dex.volume24hUsd,
      dex.volume7dUsd,
      dex.volume30dUsd,
      dex.tvlUsd,
    ].some((metric) => typeof metric === "number" && Number.isFinite(metric)),
  );

  return hasHealthySource && (hasObservedMetric || value.benchmarkSeries.length > 0);
}

function parseDashboardSnapshot(payload: string): DashboardData | null {
  try {
    const value = JSON.parse(payload) as DashboardData;
    return isDashboardSnapshotUsable(value) ? value : null;
  } catch {
    return null;
  }
}

export async function readDashboardSnapshot(
  database = getDashboardSnapshotDatabase(),
): Promise<StoredDashboardSnapshot | null> {
  if (!database) return null;

  const row = await database
    .prepare(
      `SELECT payload_json, generated_at, updated_at, refresh_lease_until, last_error
       FROM dashboard_snapshots
       WHERE id = ?`,
    )
    .bind(DASHBOARD_SNAPSHOT_ID)
    .first<DashboardSnapshotRow>();

  if (!row?.payload_json || !row.generated_at) return null;
  const value = parseDashboardSnapshot(row.payload_json);
  if (!value) return null;

  return {
    generatedAt: row.generated_at,
    lastError: row.last_error,
    refreshLeaseUntil: row.refresh_lease_until,
    updatedAt: row.updated_at,
    value,
  };
}

export async function acquireDashboardRefreshLease(
  database = getDashboardSnapshotDatabase(),
  now = Date.now(),
) {
  if (!database) return false;

  const results = await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO dashboard_snapshots (
           id, payload_json, generated_at, updated_at, refresh_lease_until,
           last_attempt_at, last_error
         ) VALUES (?, NULL, NULL, 0, 0, NULL, NULL)`,
      )
      .bind(DASHBOARD_SNAPSHOT_ID),
    database
      .prepare(
        `UPDATE dashboard_snapshots
         SET refresh_lease_until = ?, last_attempt_at = ?, last_error = NULL
         WHERE id = ? AND refresh_lease_until <= ?`,
      )
      .bind(
        now + DASHBOARD_REFRESH_LEASE_MS,
        now,
        DASHBOARD_SNAPSHOT_ID,
        now,
      ),
  ]);
  const lease = results[1];

  return (lease.meta?.changes || 0) > 0;
}

export async function writeDashboardSnapshot(
  value: DashboardData,
  database = getDashboardSnapshotDatabase(),
  now = Date.now(),
) {
  if (!database) return;
  if (!isDashboardSnapshotUsable(value)) {
    throw new Error("Refusing to replace the durable dashboard snapshot with unusable data.");
  }

  await database
    .prepare(
      `UPDATE dashboard_snapshots
       SET payload_json = ?, generated_at = ?, updated_at = ?,
           refresh_lease_until = 0, last_error = NULL
       WHERE id = ?`,
    )
    .bind(JSON.stringify(value), value.generatedAt, now, DASHBOARD_SNAPSHOT_ID)
    .run();
}

export async function recordDashboardRefreshFailure(
  error: unknown,
  database = getDashboardSnapshotDatabase(),
) {
  if (!database) return;

  const message = error instanceof Error ? error.message : "Unknown dashboard refresh error";
  await database
    .prepare(
      `UPDATE dashboard_snapshots
       SET refresh_lease_until = 0, last_error = ?
       WHERE id = ?`,
    )
    .bind(message.slice(0, 1_000), DASHBOARD_SNAPSHOT_ID)
    .run();
}
