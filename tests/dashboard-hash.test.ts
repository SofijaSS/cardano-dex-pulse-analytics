import { describe, expect, it, vi } from "vitest";
import {
  dashboardSectionIdFromHash,
  scrollToDashboardHash,
} from "../lib/dashboard-hash";

describe("dashboard direct section links", () => {
  for (const sectionId of [
    "overview",
    "weekly-report",
    "dex-table",
    "charts",
  ]) {
    it(`scrolls /#${sectionId} into view after the dashboard renders`, () => {
      const scrollIntoView = vi.fn();
      const getElementById = vi.fn(
        () => ({ scrollIntoView }) as unknown as HTMLElement,
      );

      expect(
        scrollToDashboardHash(`#${sectionId}`, { getElementById }),
      ).toBe(true);
      expect(getElementById).toHaveBeenCalledWith(sectionId);
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start",
      });
    });
  }

  it("ignores unknown or malformed hashes", () => {
    expect(dashboardSectionIdFromHash("#unknown")).toBeNull();
    expect(dashboardSectionIdFromHash("#%E0%A4%A")).toBeNull();
    expect(dashboardSectionIdFromHash("overview")).toBeNull();
  });
});
