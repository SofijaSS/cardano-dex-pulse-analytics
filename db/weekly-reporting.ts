import type { WeeklyReportingSnapshot } from "@/lib/weekly-reporting";

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
}

let initializedDatabase: D1DatabaseLike | null = null;

async function runtimeD1Binding(): Promise<D1DatabaseLike | null> {
  try {
    const moduleName = ["cloudflare", "workers"].join(":");
    const runtime = await import(/* webpackIgnore: true */ moduleName) as {
      env?: { DB?: D1DatabaseLike };
    };
    return runtime.env?.DB ?? null;
  } catch {
    return null;
  }
}

async function ensureWeeklyReportingTable(database: D1DatabaseLike) {
  if (initializedDatabase === database) return;
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS weekly_reporting_snapshots (
      week_key TEXT PRIMARY KEY NOT NULL,
      scheduled_for TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      source_generated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
  `).run();
  initializedDatabase = database;
}

export async function readWeeklyReportingSnapshot(
  weekKey: string,
): Promise<WeeklyReportingSnapshot | null | undefined> {
  const database = await runtimeD1Binding();
  if (!database) return undefined;
  await ensureWeeklyReportingTable(database);
  const row = await database
    .prepare(`
      SELECT payload_json
      FROM weekly_reporting_snapshots
      WHERE week_key = ?1
      LIMIT 1
    `)
    .bind(weekKey)
    .first<{ payload_json: string }>();
  if (!row) return null;
  return JSON.parse(row.payload_json) as WeeklyReportingSnapshot;
}

export async function insertWeeklyReportingSnapshot(
  snapshot: WeeklyReportingSnapshot,
): Promise<WeeklyReportingSnapshot | undefined> {
  const database = await runtimeD1Binding();
  if (!database) return undefined;
  await ensureWeeklyReportingTable(database);
  await database
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
    )
    .run();
  return (await readWeeklyReportingSnapshot(snapshot.weekKey)) ?? snapshot;
}
