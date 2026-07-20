import { describe, expect, it } from "vitest";
import {
  PROTECTED_TRANSLATION_TERMS,
  splitProtectedTerms,
} from "@/lib/translation";

describe("translation protection", () => {
  it("protects currencies and complete configured DEX names", () => {
    const segments = splitProtectedTerms(
      "WingRiders V2 recorded volume in ADA and USD beside Minswap and SundaeSwap V3.",
    );
    const protectedValues = segments
      .filter((segment) => segment.protected)
      .map((segment) => segment.value);

    expect(protectedValues).toEqual([
      "WingRiders V2",
      "ADA",
      "USD",
      "Minswap",
      "SundaeSwap V3",
    ]);
  });

  it("derives protection from every configurable DEX name", () => {
    for (const name of ["Splash", "VyFinance", "CSWAP", "snek.fun"]) {
      expect(PROTECTED_TRANSLATION_TERMS).toContain(name);
      expect(splitProtectedTerms(name)).toEqual([
        { protected: true, value: name },
      ]);
    }
  });
});
