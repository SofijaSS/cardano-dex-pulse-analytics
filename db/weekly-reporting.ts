import type { WeeklyReportingSnapshot } from "@/lib/weekly-reporting";
import {
  backfillWeeklyReportingPreviousState,
  emptyWeeklyReportingState,
  rotateWeeklyReportingState,
  type WeeklyReportingState,
} from "@/lib/weekly-state";

interface D1Result<T> {
  results?: T[];
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1DatabaseLike {
  prepare(query: string): D1Statement;
  batch?<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

interface SnapshotRow {
  payload_json: string;
}

let initializedDatabase: D1DatabaseLike | null = null;

async function runtimeD1Binding(): Promise<D1DatabaseLike | null> {
  try {
    const moduleName = ["cloudflare", "workers"].join(":");
    const runtime = (await import(/* webpackIgnore: true */ moduleName)) as {
      env?: { DB?: D1DatabaseLike };
    };
    return runtime.env?.DB ?? null;
  } catch {
    return null;
  }
}

async function ensureWeeklyReportingTable(database: D1DatabaseLike) {
  if (initializedDatabase === database) return;
  await database
    .prepare(`
      CREATE TABLE IF NOT EXISTS weekly_reporting_snapshots (
        week_key TEXT PRIMARY KEY NOT NULL,
        scheduled_for TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        source_generated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      )
    `)
    .run();
  initializedDatabase = database;
}

function stateFromRows(rows: SnapshotRow[]): WeeklyReportingState | null {
  const snapshots = rows.map(
    (row) => JSON.parse(row.payload_json) as WeeklyReportingSnapshot,
  );
  if (snapshots.length === 0) return null;
  return {
    ...emptyWeeklyReportingState(snapshots[0].capturedAt),
    current: snapshots[0] ?? null,
    previous: snapshots[1] ?? null,
  };
}

export async function readD1WeeklyReportingState(): Promise<
  WeeklyReportingState | null | undefined
> {
  const database = await runtimeD1Binding();
  if (!database) return undefined;
  await ensureWeeklyReportingTable(database);
  const result = await database
    .prepare(`
      SELECT payload_json
      FROM weekly_reporting_snapshots
      ORDER BY week_key DESC
      LIMIT 2
    `)
    .run<SnapshotRow>();
  return stateFromRows(result.results ?? []);
}

export async function rotateD1WeeklyReportingSnapshot(
  snapshot: WeeklyReportingSnapshot,
): Promise<WeeklyReportingState | undefined> {
  const database = await runtimeD1Binding();
  if (!database) return undefined;
  await ensureWeeklyReportingTable(database);

  const currentState = await readD1WeeklyReportingState();
  const nextState = rotateWeeklyReportingState(currentState ?? null, snapshot);
  if (nextState === currentState) return currentState;

  await persistBoundedD1Snapshot(database, snapshot);
  return (await readD1WeeklyReportingState()) ?? nextState;
}

export async function backfillD1WeeklyReportingPreviousSnapshot(
  snapshot: WeeklyReportingSnapshot,
): Promise<WeeklyReportingState | undefined> {
  const database = await runtimeD1Binding();
  if (!database) return undefined;
  await ensureWeeklyReportingTable(database);

  const currentState = await readD1WeeklyReportingState();
  const nextState = backfillWeeklyReportingPreviousState(
    currentState ?? null,
    snapshot,
  );
  if (nextState === currentState) return currentState;

  await persistBoundedD1Snapshot(database, snapshot);
  return (await readD1WeeklyReportingState()) ?? nextState;
}

async function persistBoundedD1Snapshot(
  database: D1DatabaseLike,
  snapshot: WeeklyReportingSnapshot,
) {
  const insert = database
    .prepare(`
      INSERT OR IGNORE INTO weekly_reporting_snapshots (
        week_key,
        scheduled_for,
        captured_at,
        source_generated_at,
        status,
        payload_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `)
    .bind(
      snapshot.weekKey,
      snapshot.scheduledFor,
      snapshot.capturedAt,
      snapshot.sourceGeneratedAt,
      snapshot.status,
      JSON.stringify(snapshot),
    );
  const prune = database.prepare(`
    DELETE FROM weekly_reporting_snapshots
    WHERE week_key NOT IN (
      SELECT week_key
      FROM weekly_reporting_snapshots
      ORDER BY week_key DESC
      LIMIT 2
    )
  `);

  if (database.batch) {
    await database.batch([insert, prune]);
  } else {
    await insert.run();
    await prune.run();
  }
}
