import {
  readD1WeeklyReportingState,
  rotateD1WeeklyReportingSnapshot,
} from "@/db/weekly-reporting";
import type { WeeklyReportingSnapshot } from "@/lib/weekly-reporting";
import type { WeeklyReportingState } from "@/lib/weekly-state";
import {
  readVercelWeeklyReportingState,
  rotateVercelWeeklyReportingSnapshot,
} from "@/lib/vercel-weekly-blob";

export type WeeklyReportingStoreKind = "d1" | "vercel-blob";

export interface DurableWeeklyReportingState {
  kind: WeeklyReportingStoreKind | null;
  state: WeeklyReportingState | null;
}

export async function readDurableWeeklyReportingState(): Promise<DurableWeeklyReportingState> {
  const d1 = await readD1WeeklyReportingState();
  if (d1 !== undefined) return { kind: "d1", state: d1 };

  const blob = await readVercelWeeklyReportingState();
  if (blob !== undefined) return { kind: "vercel-blob", state: blob };

  return { kind: null, state: null };
}

export async function rotateDurableWeeklyReportingSnapshot(
  snapshot: WeeklyReportingSnapshot,
): Promise<DurableWeeklyReportingState> {
  const d1 = await rotateD1WeeklyReportingSnapshot(snapshot);
  if (d1 !== undefined) return { kind: "d1", state: d1 };

  const blob = await rotateVercelWeeklyReportingSnapshot(snapshot);
  if (blob !== undefined) return { kind: "vercel-blob", state: blob };

  return { kind: null, state: null };
}
