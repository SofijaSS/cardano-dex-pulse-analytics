import { describe, expect, it } from "vitest";
import {
  classifySourceQuality,
  safeDivide,
  safePercentChange,
  sumAvailable,
  variancePct,
} from "../lib/calculations";
import { formatMoney } from "../lib/format";

describe("safePercentChange", () => {
  it("uses the required current-versus-previous formula", () => {
    expect(safePercentChange(125, 100)).toBe(25);
    expect(safePercentChange(75, 100)).toBe(-25);
  });

  it("returns null when the previous period is zero or unavailable", () => {
    expect(safePercentChange(100, 0)).toBeNull();
    expect(safePercentChange(100, null)).toBeNull();
    expect(safePercentChange(null, 100)).toBeNull();
  });
});

describe("safeDivide", () => {
  it("protects volume-to-TVL calculations from zero and missing TVL", () => {
    expect(safeDivide(50, 100)).toBe(0.5);
    expect(safeDivide(50, 0)).toBeNull();
    expect(safeDivide(50, null)).toBeNull();
  });
});

describe("source reconciliation", () => {
  it("flags aligned and materially different source values", () => {
    expect(variancePct(110, 100)).toBeCloseTo(10);
    expect(classifySourceQuality(110, 100)).toBe("aligned");
    expect(classifySourceQuality(150, 100)).toBe("material-variance");
  });

  it("does not imply a comparison when one source is missing", () => {
    expect(classifySourceQuality(100, null)).toBe("native-only");
    expect(classifySourceQuality(null, 100)).toBe("benchmark-only");
    expect(classifySourceQuality(null, null)).toBe("unavailable");
  });
});

describe("sumAvailable", () => {
  it("keeps missing cohorts distinct from real zero totals", () => {
    expect(sumAvailable([null, undefined])).toBeNull();
    expect(sumAvailable([0, null])).toBe(0);
    expect(sumAvailable([10, null, 5])).toBe(15);
  });
});

describe("report formatting", () => {
  it("places a negative sign before the USD symbol", () => {
    expect(formatMoney(-1_250, "USD", null, false)).toBe("-$1,250");
  });
});
