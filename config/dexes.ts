export interface DexConfig {
  id: string;
  name: string;
  color: string;
  volumeAliases: string[];
  tvlAliases: string[];
  required: boolean;
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

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
