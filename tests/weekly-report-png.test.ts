import { describe, expect, it } from "vitest";
import { calculateWeeklyPngScale } from "@/lib/weekly-report-png";

describe("weekly report PNG sizing", () => {
  it("renders the weekly report at high resolution on standard displays", () => {
    expect(calculateWeeklyPngScale(1_600, 800, 1)).toBe(2);
  });

  it("renders a 4000 × 2000 image on Retina displays", () => {
    const scale = calculateWeeklyPngScale(1_600, 800, 2);

    expect(scale).toBe(2.5);
    expect(Math.ceil(1_600 * scale)).toBe(4_000);
    expect(Math.ceil(800 * scale)).toBe(2_000);
  });

  it("keeps unusually large reports inside clipboard-safe dimensions", () => {
    const width = 2_000;
    const height = 1_200;
    const scale = calculateWeeklyPngScale(width, height, 3);

    expect(Math.ceil(width * scale)).toBeLessThanOrEqual(4_096);
    expect(Math.ceil(height * scale)).toBeLessThanOrEqual(3_072);
    expect(Math.ceil(width * height * scale * scale)).toBeLessThanOrEqual(
      12_000_000,
    );
  });
});
