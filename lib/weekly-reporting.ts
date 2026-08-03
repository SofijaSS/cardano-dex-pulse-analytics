import { safePercentChange, sumAvailable } from "@/lib/calculations";
import { CENTRAL_EUROPE_TIME_ZONE } from "@/lib/format";
import type {
  DashboardData,
  DexMetric,
  WeeklyReportingStatus,
} from "@/lib/types";

export const WEEKLY_REPORTING_TIME_ZONE = CENTRAL_EUROPE_TIME_ZONE;
export const WEEKLY_REPORTING_HOUR = 8;

type SnapshotStatus = "captured" | "seeded" | "late";

export interface WeeklyDexSnapshot {
  volume7dAda: number | null;
  volume7dUsd: number | null;
  weekChangePct?: number | null;
}

export interface WeeklyReportingSnapshot {
  weekKey: string;
  scheduledFor: string;
  capturedAt: string;
  sourceGeneratedAt: string;
  adaPriceUsd: number | null;
  status: SnapshotStatus;
  dexes: Record<string, WeeklyDexSnapshot>;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const localPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: WEEKLY_REPORTING_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(value: Date) {
  const parts = Object.fromEntries(
    localPartsFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function dateKeyFromUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function previousReportingWeekKey(weekKey: string) {
  const [year, month, day] = weekKey.split("-").map(Number);
  return dateKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day - 7)));
}

export function latestReportingWeekKey(now = new Date()) {
  const parts = localParts(now);
  const weekday = WEEKDAY_INDEX[parts.weekday];
  let daysSinceWednesday = (weekday - WEEKDAY_INDEX.Wed + 7) % 7;
  if (
    daysSinceWednesday === 0 &&
    (parts.hour < WEEKLY_REPORTING_HOUR)
  ) {
    daysSinceWednesday = 7;
  }
  return dateKeyFromUtcDate(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceWednesday)),
  );
}

function offsetMilliseconds(value: Date) {
  const parts = localParts(value);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - value.getTime();
}

export function reportingScheduledFor(weekKey: string) {
  const [year, month, day] = weekKey.split("-").map(Number);
  const localAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    WEEKLY_REPORTING_HOUR,
  );
  let candidate = new Date(localAsUtc);
  candidate = new Date(localAsUtc - offsetMilliseconds(candidate));
  candidate = new Date(localAsUtc - offsetMilliseconds(candidate));
  return candidate.toISOString();
}

export function isWeeklyCaptureHour(now = new Date()) {
  const parts = localParts(now);
  return parts.weekday === "Wed" && parts.hour === WEEKLY_REPORTING_HOUR;
}

function snapshotDexes(
  data: DashboardData,
): Record<string, WeeklyDexSnapshot> {
  const adaPrice = data.price.usd;
  return Object.fromEntries(
    data.dexes.map((dex) => [
      dex.id,
      {
        volume7dAda:
          dex.volume7dUsd != null && adaPrice != null && adaPrice > 0
            ? dex.volume7dUsd / adaPrice
            : null,
        volume7dUsd: dex.volume7dUsd,
      },
    ]),
  );
}

export function buildWeeklyReportingSnapshot(
  data: DashboardData,
  weekKey: string,
  capturedAt = new Date(),
): WeeklyReportingSnapshot {
  const scheduledFor = reportingScheduledFor(weekKey);
  return {
    weekKey,
    scheduledFor,
    capturedAt: capturedAt.toISOString(),
    sourceGeneratedAt: data.generatedAt,
    adaPriceUsd: data.price.usd,
    status:
      capturedAt.getTime() - new Date(scheduledFor).getTime() > 60 * 60_000
        ? "late"
        : "captured",
    dexes: snapshotDexes(data),
  };
}

const MILLION = 1_000_000;
const THOUSAND = 1_000;

function seedDexes(
  values: Record<string, number | null>,
  changes: Record<string, number | null> = {},
) {
  return Object.fromEntries(
    Object.entries(values).map(([id, volume7dAda]) => [
      id,
      {
        volume7dAda,
        volume7dUsd: null,
        ...(id in changes ? { weekChangePct: changes[id] } : {}),
      },
    ]),
  );
}

const SEEDED_WEEKLY_SNAPSHOTS: Record<string, WeeklyReportingSnapshot> = {
  "2026-07-22": {
    weekKey: "2026-07-22",
    scheduledFor: reportingScheduledFor("2026-07-22"),
    capturedAt: "2026-07-22T08:31:00.000Z",
    sourceGeneratedAt: "2026-07-22T08:31:00.000Z",
    adaPriceUsd: null,
    status: "seeded",
    dexes: seedDexes({
      minswap: (151.88 + 0.67623) * MILLION,
      "minswap-v2": 151.88 * MILLION,
      "minswap-v1": 676.23 * THOUSAND,
      wingriders: 15.43 * MILLION,
      "wingriders-v2": 15.43 * MILLION,
      "wingriders-v1": null,
      sundaeswap: (11.62 + 0.08873) * MILLION,
      "sundaeswap-v3": 11.62 * MILLION,
      "sundaeswap-v1": 88.73 * THOUSAND,
      "dano-finance": 7.2 * MILLION,
      cswap: 4.07 * MILLION,
      splash: 1.97 * MILLION,
      vyfinance: 0,
    }),
  },
  "2026-07-29": {
    weekKey: "2026-07-29",
    scheduledFor: reportingScheduledFor("2026-07-29"),
    capturedAt: "2026-07-29T08:31:00.000Z",
    sourceGeneratedAt: "2026-07-29T08:31:00.000Z",
    adaPriceUsd: null,
    status: "seeded",
    dexes: seedDexes(
      {
        minswap: (39.66 + 0.73229) * MILLION,
        "minswap-v2": 39.66 * MILLION,
        "minswap-v1": 732.29 * THOUSAND,
        wingriders: 6.46 * MILLION,
        "wingriders-v2": 6.46 * MILLION,
        "wingriders-v1": 71.4 * THOUSAND,
        sundaeswap: (4.67 + 0.08972) * MILLION,
        "sundaeswap-v3": 4.67 * MILLION,
        "sundaeswap-v1": 89.72 * THOUSAND,
        "dano-finance": 2.95 * MILLION,
        cswap: 1.27 * MILLION,
        splash: 937.68 * THOUSAND,
        vyfinance: 471.14 * THOUSAND,
      },
      {
        "minswap-v2": -73.9,
        "minswap-v1": 8.3,
        "wingriders-v2": -58.2,
        "sundaeswap-v3": -59.8,
        "sundaeswap-v1": 1.1,
        "dano-finance": -59.0,
        cswap: -68.6,
        splash: -52.4,
        vyfinance: null,
      },
    ),
  },
};

export function getSeededWeeklySnapshot(weekKey: string) {
  return SEEDED_WEEKLY_SNAPSHOTS[weekKey] ?? null;
}

function reportingValue(
  value: WeeklyDexSnapshot | undefined,
  currentAdaPriceUsd: number | null,
) {
  if (!value) return null;
  if (
    value.volume7dAda != null &&
    currentAdaPriceUsd != null &&
    currentAdaPriceUsd > 0
  ) {
    return value.volume7dAda * currentAdaPriceUsd;
  }
  return value.volume7dUsd;
}

function withWeeklyDexValues(
  dex: DexMetric,
  current: WeeklyReportingSnapshot,
  previous: WeeklyReportingSnapshot | null,
  currentAdaPriceUsd: number | null,
) {
  const currentSnapshot = current.dexes[dex.id];
  if (!currentSnapshot) {
    return {
      ...dex,
      volume7dUsd: null,
      previous7dUsd: null,
      weekChangePct: null,
      periodNote: `${dex.periodNote} Weekly reporting: this DEX was not present in the archived ${current.weekKey} reporting snapshot, so its rolling value is not substituted.`,
    };
  }
  const previousSnapshot = previous?.dexes[dex.id];
  const volume7dUsd = reportingValue(currentSnapshot, currentAdaPriceUsd);
  const previous7dUsd = reportingValue(previousSnapshot, currentAdaPriceUsd);
  const weekChangePct =
    currentSnapshot.weekChangePct !== undefined
      ? currentSnapshot.weekChangePct
      : safePercentChange(
          currentSnapshot.volume7dAda ?? currentSnapshot.volume7dUsd,
          previousSnapshot?.volume7dAda ?? previousSnapshot?.volume7dUsd,
        );
  return {
    ...dex,
    volume7dUsd,
    previous7dUsd,
    weekChangePct,
    periodNote: [
      dex.periodNote,
      `Weekly reporting: 7d volume was frozen at the ${current.weekKey} Wednesday snapshot; Previous 7d comes from ${previous?.weekKey ?? "an unavailable prior snapshot"}. The reporting cutoff is Wednesday 08:00 Europe/Belgrade.`,
    ].join(" "),
  };
}

export function applyWeeklyReportingSnapshots(
  data: DashboardData,
  current: WeeklyReportingSnapshot,
  previous: WeeklyReportingSnapshot | null,
): DashboardData {
  const dexes = data.dexes.map((dex) =>
    withWeeklyDexValues(dex, current, previous, data.price.usd),
  );
  const protocolRows = dexes.filter((dex) => dex.rowKind === "protocol");
  const comparable = protocolRows.filter(
    (dex) => dex.volume7dUsd != null && dex.previous7dUsd != null,
  );
  const currentComparable = sumAvailable(
    comparable.map((dex) => dex.volume7dUsd),
  );
  const previousComparable = sumAvailable(
    comparable.map((dex) => dex.previous7dUsd),
  );
  const weeklyReporting: WeeklyReportingStatus = {
    timeZone: WEEKLY_REPORTING_TIME_ZONE,
    cutoff: "Wednesday 08:00",
    currentWeekKey: current.weekKey,
    previousWeekKey: previous?.weekKey ?? previousReportingWeekKey(current.weekKey),
    currentScheduledFor: current.scheduledFor,
    previousScheduledFor:
      previous?.scheduledFor ??
      reportingScheduledFor(previousReportingWeekKey(current.weekKey)),
    currentCapturedAt: current.capturedAt,
    previousCapturedAt: previous?.capturedAt ?? null,
    currentStatus: current.status,
  };

  return {
    ...data,
    weeklyReporting,
    dexes,
    aggregates: {
      ...data.aggregates,
      observed7dUsd: sumAvailable(protocolRows.map((dex) => dex.volume7dUsd)),
      comparableWeekChangePct: safePercentChange(
        currentComparable,
        previousComparable,
      ),
      coverage7d: protocolRows.filter((dex) => dex.volume7dUsd != null).length,
    },
    warnings: [
      ...data.warnings,
      `Weekly reporting is frozen to Wednesday 08:00 Europe/Belgrade snapshots. Current ${current.weekKey}; previous ${previous?.weekKey ?? "unavailable"}.`,
    ],
  };
}
