import { z } from "zod";

export interface PoolFlowDexPeriod {
  volumeAda: number;
  trades: number | null;
  users: number | null;
  dau: number | null;
  feesAda: number | null;
}

const countSchema = z.number().int().nonnegative().nullable().optional();
const metricSchema = z.number().finite().nonnegative();
const protocolSchema = z.object({
  dex: z.string().min(1),
  volume: metricSchema,
  trades: countSchema,
  users: countSchema,
  dau: countSchema,
  fees: metricSchema.nullable().optional(),
}).passthrough();
const responseSchema = z.object({
  range_days: z.number().int().positive(),
  protocols: z.array(protocolSchema),
}).passthrough();

// PoolFlow protocol IDs are explicit deployment identities, not display-name guesses.
export const POOLFLOW_DEX_MAPPING: Record<string, string> = {
  "minswap-v1": "minswap-v1",
  "minswap-v2": "minswap-v2",
  splash: "splash",
  snekfun: "snek-fun",
  wingriders: "wingriders-v1",
  "wingriders-v2": "wingriders-v2",
};

export function parsePoolFlowMarkets(
  payload: unknown,
  expectedDays: 1 | 7 | 30,
): Record<string, PoolFlowDexPeriod> {
  const parsed = responseSchema.parse(payload);
  if (parsed.range_days !== expectedDays) {
    throw new Error(
      `PoolFlow returned ${parsed.range_days} days for a ${expectedDays}-day request.`,
    );
  }

  const result: Record<string, PoolFlowDexPeriod> = {};
  for (const protocol of parsed.protocols) {
    const dashboardId = POOLFLOW_DEX_MAPPING[protocol.dex];
    if (!dashboardId) continue;
    if (result[dashboardId]) {
      throw new Error(`PoolFlow returned duplicate ${protocol.dex} rows.`);
    }
    result[dashboardId] = {
      volumeAda: protocol.volume,
      trades: protocol.trades ?? null,
      users: protocol.users ?? null,
      dau: protocol.dau ?? null,
      feesAda: protocol.fees ?? null,
    };
  }
  return result;
}

export function parsePoolFlowWingRidersV1(
  payload: unknown,
  expectedDays: 1 | 7 | 30 = 1,
): PoolFlowDexPeriod {
  const result = parsePoolFlowMarkets(payload, expectedDays)["wingriders-v1"];
  if (!result) {
    throw new Error(
      "PoolFlow response did not contain a validated WingRiders V1 market row.",
    );
  }
  return result;
}
