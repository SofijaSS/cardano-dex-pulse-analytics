import type { DashboardData } from "@/lib/types";
import {
  applyWeeklyReportingSnapshots,
  buildWeeklyReportingSnapshot,
  getSeededWeeklySnapshot,
  latestReportingWeekKey,
  previousReportingWeekKey,
  type WeeklyReportingSnapshot,
} from "@/lib/weekly-reporting";
import {
  backfillDurableWeeklyReportingCurrentMissingValues,
  backfillDurableWeeklyReportingPreviousSnapshot,
  readDurableWeeklyReportingState,
  rotateDurableWeeklyReportingSnapshot,
} from "@/lib/weekly-state-store";
import {
  backfillWeeklyReportingCurrentMissingValues,
  snapshotFromWeeklyState,
  type WeeklyReportingState,
} from "@/lib/weekly-state";

function snapshotForWeek(
  state: WeeklyReportingState | null,
  weekKey: string,
) {
  return getSeededWeeklySnapshot(weekKey) ??
    snapshotFromWeeklyState(state, weekKey);
}

export async function captureWeeklyReportingSnapshot(
  dashboard: DashboardData,
  weekKey = latestReportingWeekKey(),
  capturedAt = new Date(),
) {
  const seeded = getSeededWeeklySnapshot(weekKey);
  const snapshot =
    seeded ?? buildWeeklyReportingSnapshot(dashboard, weekKey, capturedAt);
  const durable = await rotateDurableWeeklyReportingSnapshot(snapshot);
  if (!durable.kind || !durable.state) {
    throw new Error(
      "Durable weekly reporting storage is not configured for this deployment.",
    );
  }

  const persisted = snapshotFromWeeklyState(durable.state, weekKey);
  if (!persisted) {
    throw new Error(
      `Durable weekly reporting storage did not retain snapshot ${weekKey}.`,
    );
  }
  return persisted;
}

function applyWithWarnings(
  dashboard: DashboardData,
  current: WeeklyReportingSnapshot,
  previous: WeeklyReportingSnapshot | null,
  warnings: string[],
) {
  const result = applyWeeklyReportingSnapshots(dashboard, current, previous);
  return {
    ...result,
    warnings: [...result.warnings, ...warnings],
  };
}

export async function withWeeklyReporting(
  dashboard: DashboardData,
  now = new Date(),
) {
  const currentWeekKey = latestReportingWeekKey(now);
  const previousWeekKey = previousReportingWeekKey(currentWeekKey);
  let durable;

  try {
    durable = await readDurableWeeklyReportingState();
  } catch (error) {
    const current =
      getSeededWeeklySnapshot(currentWeekKey) ??
      buildWeeklyReportingSnapshot(dashboard, currentWeekKey, now);
    const previous = getSeededWeeklySnapshot(previousWeekKey);
    return applyWithWarnings(dashboard, current, previous, [
      `Durable weekly reporting storage could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
    ]);
  }

  let state = durable.state;
  const warnings: string[] = [];
  const seededCurrent = getSeededWeeklySnapshot(currentWeekKey);

  if (
    seededCurrent &&
    durable.kind &&
    snapshotFromWeeklyState(state, currentWeekKey)
  ) {
    try {
      const candidate = backfillWeeklyReportingCurrentMissingValues(
        state,
        seededCurrent,
      );
      if (candidate !== state) {
        const backfilled =
          await backfillDurableWeeklyReportingCurrentMissingValues(
            seededCurrent,
          );
        state = backfilled.state;
        durable = backfilled;
      }
    } catch (error) {
      warnings.push(
        `Missing values in seeded weekly snapshot ${currentWeekKey} could not be backfilled into durable storage: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  let current = snapshotForWeek(state, currentWeekKey);

  if (
    current &&
    seededCurrent &&
    durable.kind &&
    !snapshotFromWeeklyState(state, currentWeekKey)
  ) {
    try {
      const migrated = await rotateDurableWeeklyReportingSnapshot(current);
      state = migrated.state;
      durable = migrated;
    } catch (error) {
      warnings.push(
        `Seeded weekly snapshot ${currentWeekKey} could not be migrated to durable storage: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (!current) {
    try {
      current = await captureWeeklyReportingSnapshot(
        dashboard,
        currentWeekKey,
        now,
      );
      const refreshed = await readDurableWeeklyReportingState();
      state = refreshed.state;
      durable = refreshed;
    } catch (error) {
      current = buildWeeklyReportingSnapshot(dashboard, currentWeekKey, now);
      warnings.push(
        `Current weekly snapshot is not durable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  let previous = snapshotForWeek(state, previousWeekKey);
  if (
    previous &&
    getSeededWeeklySnapshot(previousWeekKey) &&
    durable.kind &&
    !snapshotFromWeeklyState(state, previousWeekKey)
  ) {
    try {
      const backfilled =
        await backfillDurableWeeklyReportingPreviousSnapshot(previous);
      state = backfilled.state;
      durable = backfilled;
      previous = snapshotForWeek(state, previousWeekKey);
    } catch (error) {
      warnings.push(
        `Seeded weekly snapshot ${previousWeekKey} could not be backfilled into durable storage: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  if (!previous) {
    warnings.push(
      `Previous weekly reporting snapshot ${previousWeekKey} is unavailable and was not reconstructed from a later rolling period.`,
    );
  }
  if (!durable.kind) {
    warnings.push(
      "Durable weekly reporting storage is not configured; current data is a non-durable fallback.",
    );
  }

  return applyWithWarnings(dashboard, current, previous, warnings);
}
