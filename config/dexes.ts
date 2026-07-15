export interface DexConfig {
  id: string;
  name: string;
  color: string;
  volumeAliases: string[];
  tvlAliases: string[];
  required: boolean;
}

export interface DexVersionConfig {
  id: string;
  parentId: string;
  name: string;
  version: string;
  nativeType?: string;
  unavailableNote: string;
}

export const DEX_REGISTRY: DexConfig[] = [
  {
    id: "wingriders",
    name: "WingRiders",
    color: "#1b5cff",
    volumeAliases: ["WingRiders"],
    tvlAliases: ["WingRiders"],
    required: true,
  },
  {
    id: "minswap",
    name: "Minswap",
    color: "#00a86b",
    volumeAliases: ["Minswap DEX"],
    tvlAliases: ["Minswap DEX"],
    required: true,
  },
  {
    id: "sundaeswap",
    name: "SundaeSwap",
    color: "#ef6c47",
    volumeAliases: ["SundaeSwap V2"],
    tvlAliases: ["SundaeSwap V2", "SundaeSwap V3"],
    required: true,
  },
  {
    id: "splash",
    name: "Splash",
    color: "#02a9f7",
    volumeAliases: ["Splash Protocol", "ErgoDEX"],
    tvlAliases: ["Splash Protocol"],
    required: true,
  },
  {
    id: "muesliswap",
    name: "MuesliSwap",
    color: "#be7b43",
    volumeAliases: ["MuesliSwap"],
    tvlAliases: ["MuesliSwap"],
    required: true,
  },
  {
    id: "vyfinance",
    name: "VyFinance",
    color: "#d9a600",
    volumeAliases: [],
    tvlAliases: ["VyFinance Dex"],
    required: true,
  },
  {
    id: "dano-finance",
    name: "Dano Finance",
    color: "#7357d6",
    volumeAliases: ["Dano Finance"],
    tvlAliases: ["Dano Finance"],
    required: false,
  },
  {
    id: "deltadefi",
    name: "DeltaDeFi",
    color: "#df3f78",
    volumeAliases: ["DeltaDeFi"],
    tvlAliases: ["DeltaDeFi"],
    required: false,
  },
  {
    id: "saturn-swap",
    name: "Saturn Swap",
    color: "#5e6a79",
    volumeAliases: ["Saturn Swap"],
    tvlAliases: ["Saturn Swap"],
    required: false,
  },
];

// Version rows are table-only and are never included in market totals or charts.
export const DEX_VERSION_REGISTRY: DexVersionConfig[] = [
  {
    id: "minswap-v2",
    parentId: "minswap",
    name: "Minswap (V2)",
    version: "V2",
    nativeType: "MinswapV2",
    unavailableNote: "Minswap V2 is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "minswap-v1",
    parentId: "minswap",
    name: "Minswap (V1)",
    version: "V1",
    nativeType: "Minswap",
    unavailableNote: "Minswap V1 is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "minswap-stable",
    parentId: "minswap",
    name: "Minswap (Stable)",
    version: "Stable",
    nativeType: "MinswapStable",
    unavailableNote: "Minswap Stable is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "wingriders-v2",
    parentId: "wingriders",
    name: "WingRiders (V2)",
    version: "V2",
    unavailableNote: "The public WingRiders endpoint reports protocol totals and does not split metrics by V2.",
  },
  {
    id: "wingriders-v1",
    parentId: "wingriders",
    name: "WingRiders (V1)",
    version: "V1",
    unavailableNote: "The public WingRiders endpoint reports protocol totals and does not split metrics by V1.",
  },
  {
    id: "sundaeswap-v3",
    parentId: "sundaeswap",
    name: "SundaeSwap (V3)",
    version: "V3",
    unavailableNote: "SundaeSwap GraphQL confirms V3, but public stats are aggregate and not split by version.",
  },
  {
    id: "sundaeswap-v1",
    parentId: "sundaeswap",
    name: "SundaeSwap (V1)",
    version: "V1",
    unavailableNote: "SundaeSwap GraphQL confirms V1, but public stats are aggregate and not split by version.",
  },
];

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
