import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  sortButtonAriaLabel,
  tableAriaSort,
} from "../lib/table-sort-accessibility";

function rgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

function luminance(hex: string) {
  const [red, green, blue] = rgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(foreground: string, background: string, amount: number) {
  return `#${rgb(foreground)
    .map((channel, index) =>
      Math.round(channel * amount + rgb(background)[index] * (1 - amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

describe("accessible table sorting", () => {
  it("applies aria-sort only to the active table header", () => {
    expect(tableAriaSort(false, "asc")).toBeUndefined();
    expect(tableAriaSort(true, "asc")).toBe("ascending");
    expect(tableAriaSort(true, "desc")).toBe("descending");
  });

  it("names both the current sort and the next button action", () => {
    expect(sortButtonAriaLabel("TVL", false, "desc")).toBe(
      "Sort by TVL in ascending order",
    );
    expect(sortButtonAriaLabel("TVL", true, "asc")).toBe(
      "TVL, sorted ascending. Sort descending",
    );
    expect(sortButtonAriaLabel("TVL", true, "desc")).toBe(
      "TVL, sorted descending. Sort ascending",
    );
  });
});

describe("light table badge contrast", () => {
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  for (const variable of [
    "--table-positive",
    "--table-negative",
    "--table-info",
  ]) {
    it(`${variable} remains above 7:1 on its tinted badge background`, () => {
      const foreground = css.match(
        new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})`),
      )?.[1];
      const tableBackground = css.match(
        /--table-sticky:\s*(#[0-9a-fA-F]{6})/,
      )?.[1];

      expect(foreground).toBeDefined();
      expect(tableBackground).toBeDefined();

      const badgeBackground = mix(
        foreground as string,
        tableBackground as string,
        0.09,
      );
      expect(
        contrastRatio(foreground as string, badgeBackground),
      ).toBeGreaterThanOrEqual(7);
    });
  }
});
