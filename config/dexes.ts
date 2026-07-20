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
  logo?: string;
  nativeType?: string;
  useParentMetrics?: boolean;
  showInTable: boolean;
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
    volumeAliases: ["SundaeSwap", "SundaeSwap V2"],
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
  {
    id: "snek-fun",
    name: "snek.fun",
    color: "#20b486",
    volumeAliases: ["snek.fun", "Snek.fun"],
    tvlAliases: ["snek.fun", "Snek.fun"],
    required: false,
  },
  {
    id: "cswap",
    name: "CSWAP",
    color: "#00b97d",
    volumeAliases: ["CSWAP DEX"],
    tvlAliases: ["CSWAP DEX"],
    required: false,
  },
  {
    id: "teddyswap",
    name: "TeddySwap",
    color: "#a87851",
    volumeAliases: ["TeddySwap"],
    tvlAliases: ["TeddySwap"],
    required: false,
  },
  {
    id: "astarter-amm",
    name: "Astarter AMM",
    color: "#557bce",
    volumeAliases: ["Astarter AMM"],
    tvlAliases: ["Astarter AMM"],
    required: false,
  },
  {
    id: "genius-yield",
    name: "Genius Yield",
    color: "#5f77a7",
    volumeAliases: ["Genius Yield"],
    tvlAliases: ["Genius Yield"],
    required: false,
  },
  {
    id: "adax-pro",
    name: "ADAX Pro",
    color: "#4c83c6",
    volumeAliases: ["ADAX Pro"],
    tvlAliases: ["ADAX Pro"],
    required: false,
  },
  {
    id: "meowswapfi",
    name: "MeowSwapFi",
    color: "#d16f91",
    volumeAliases: ["MeowSwapFi"],
    tvlAliases: ["MeowSwapFi"],
    required: false,
  },
];

// Version rows are table-only and are never included in market totals or charts.
export const DEX_VERSION_REGISTRY: DexVersionConfig[] = [
  {
    id: "minswap-v2",
    parentId: "minswap",
    name: "Minswap V2",
    version: "V2",
    nativeType: "MinswapV2",
    showInTable: true,
    unavailableNote: "Minswap V2 is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "minswap-v1",
    parentId: "minswap",
    name: "Minswap",
    version: "V1",
    nativeType: "Minswap",
    showInTable: true,
    unavailableNote: "Minswap V1 is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "minswap-stable",
    parentId: "minswap",
    name: "Minswap (Stable)",
    version: "Stable",
    nativeType: "MinswapStable",
    showInTable: false,
    unavailableNote: "Minswap Stable is configured, but its current version-level feed is unavailable.",
  },
  {
    id: "wingriders-v2",
    parentId: "wingriders",
    name: "WingRiders V2",
    version: "V2",
    logo: "/dex-logos/wingriders-v2.png",
    useParentMetrics: true,
    showInTable: true,
    unavailableNote: "WingRiders V2 is the primary deployment; its public protocol feed is unavailable.",
  },
  {
    id: "wingriders-v1",
    parentId: "wingriders",
    name: "WingRiders",
    version: "V1",
    showInTable: true,
    unavailableNote: "The isolated PoolFlow WingRiders V1 market row is currently unavailable.",
  },
  {
    id: "sundaeswap-v3",
    parentId: "sundaeswap",
    name: "SundaeSwap V3",
    version: "V3",
    useParentMetrics: true,
    showInTable: true,
    unavailableNote: "SundaeSwap V3 is the primary deployment; its public protocol feed is unavailable.",
  },
  {
    id: "sundaeswap-v1",
    parentId: "sundaeswap",
    name: "SundaeSwap V1",
    version: "V1",
    showInTable: true,
    unavailableNote: "The public SundaeSwap endpoint does not expose a separate legacy V1 metric.",
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
