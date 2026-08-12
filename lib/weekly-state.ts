import {
  previousReportingWeekKey,
  type WeeklyReportingSnapshot,
} from "@/lib/weekly-reporting";

export const WEEKLY_REPORTING_STATE_VERSION = 1 as const;

export interface WeeklyReportingState {
  version: typeof WEEKLY_REPORTING_STATE_VERSION;
  current: WeeklyReportingSnapshot | null;
  previous: WeeklyReportingSnapshot | null;
  updatedAt: string;
}

export function emptyWeeklyReportingState(
  updatedAt = new Date(0).toISOString(),
): WeeklyReportingState {
  return {
    version: WEEKLY_REPORTING_STATE_VERSION,
    current: null,
    previous: null,
    updatedAt,
  };
}

export function snapshotFromWeeklyState(
  state: WeeklyReportingState | null,
  weekKey: string,
) {
  if (state?.current?.weekKey === weekKey) return state.current;
  if (state?.previous?.weekKey === weekKey) return state.previous;
  return null;
}

export function rotateWeeklyReportingState(
  state: WeeklyReportingState | null,
  snapshot: WeeklyReportingSnapshot,
): WeeklyReportingState {
  const current = state?.current ?? null;

  if (current?.weekKey === snapshot.weekKey) {
    return state!;
  }
  if (current && snapshot.weekKey < current.weekKey) {
    throw new Error(
      `Weekly reporting snapshot ${snapshot.weekKey} is older than current ${current.weekKey}.`,
    );
  }

  return {
    version: WEEKLY_REPORTING_STATE_VERSION,
    current: snapshot,
    previous: current,
    updatedAt: snapshot.capturedAt,
  };
}

export function backfillWeeklyReportingPreviousState(
  state: WeeklyReportingState | null,
  snapshot: WeeklyReportingSnapshot,
): WeeklyReportingState {
  if (!state?.current) {
    throw new Error(
      "A current weekly reporting snapshot is required before backfilling previous.",
    );
  }
  const expectedWeekKey = previousReportingWeekKey(state.current.weekKey);
  if (snapshot.weekKey !== expectedWeekKey) {
    throw new Error(
      `Weekly reporting backfill ${snapshot.weekKey} does not match expected previous week ${expectedWeekKey}.`,
    );
  }
  if (state.previous?.weekKey === snapshot.weekKey) return state;
  if (state.previous) {
    throw new Error(
      `Weekly reporting previous slot already contains ${state.previous.weekKey}.`,
    );
  }

  return {
    ...state,
    previous: snapshot,
  };
}

export function isWeeklyReportingState(
  value: unknown,
): value is WeeklyReportingState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeeklyReportingState>;
  if (candidate.version !== WEEKLY_REPORTING_STATE_VERSION) return false;
  if (typeof candidate.updatedAt !== "string") return false;

  return [candidate.current, candidate.previous].every(
    (snapshot) =>
      snapshot === null ||
      (typeof snapshot === "object" &&
        typeof snapshot.weekKey === "string" &&
        typeof snapshot.scheduledFor === "string" &&
        typeof snapshot.capturedAt === "string" &&
        typeof snapshot.sourceGeneratedAt === "string" &&
        typeof snapshot.dexes === "object" &&
        snapshot.dexes !== null),
  );
}
