import { DEX_REGISTRY, DEX_VERSION_REGISTRY } from "@/config/dexes";
import { DEX_TOKEN_REGISTRY } from "@/config/tokens";

const BASE_PROTECTED_TERMS = [
  "Cardano DEX Pulse",
  "DefiLlama",
  "CoinGecko",
  "DEXes",
  "OHLCV",
  "TVL",
  "DAU",
  "DEX",
  "ADA",
  "USD",
];

export const PROTECTED_TRANSLATION_TERMS = Array.from(new Set([
  ...BASE_PROTECTED_TERMS,
  ...DEX_REGISTRY.map((dex) => dex.name),
  ...DEX_VERSION_REGISTRY.map((dex) => dex.name),
  ...DEX_TOKEN_REGISTRY.flatMap((token) => [
    token.dexName,
    token.ticker,
    token.tokenName,
  ]),
])).sort((left, right) => right.length - left.length);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const protectedTermsPattern = new RegExp(
  PROTECTED_TRANSLATION_TERMS.map(escapeRegExp).join("|"),
  "g",
);

export type TranslationSegment = {
  protected: boolean;
  value: string;
};

export function splitProtectedTerms(value: string): TranslationSegment[] {
  const segments: TranslationSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(protectedTermsPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ protected: false, value: value.slice(cursor, index) });
    }
    segments.push({ protected: true, value: match[0] });
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    segments.push({ protected: false, value: value.slice(cursor) });
  }

  return segments.length ? segments : [{ protected: false, value }];
}
