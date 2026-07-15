export interface DexTokenConfig {
  id: string;
  dexName: string;
  ticker: string;
  tokenName: string;
  description: string;
  tokenId: string;
  logo: string;
  color: string;
}

export const DEX_TOKEN_REGISTRY = [
  {
    id: "wrt",
    dexName: "WingRiders",
    ticker: "WRT",
    tokenName: "WingRiders Governance Token",
    description: "Governance token for the WingRiders ecosystem.",
    tokenId: "c0ee29a85b13209423b10447d3c2e6a50641a15c57770e27cb9d507357696e67526964657273",
    logo: "/dex-logos/wingriders-v2.png",
    color: "#1b5cff",
  },
  {
    id: "min",
    dexName: "Minswap",
    ticker: "MIN",
    tokenName: "Minswap Token",
    description: "Utility and governance token for Minswap.",
    tokenId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
    logo: "https://icons.llamao.fi/icons/protocols/minswap-dex",
    color: "#00a86b",
  },
  {
    id: "sundae",
    dexName: "SundaeSwap",
    ticker: "SUNDAE",
    tokenName: "SundaeSwap Token",
    description: "Governance token for the SundaeSwap protocol.",
    tokenId: "9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d7753554e444145",
    logo: "https://icons.llamao.fi/icons/protocols/sundaeswap-v3",
    color: "#ef6c47",
  },
  {
    id: "splash",
    dexName: "Splash",
    ticker: "SPLASH",
    tokenName: "Splash Token",
    description: "Governance and protocol-fee token for Splash.",
    tokenId: "ececc92aeaaac1f5b665f567b01baec8bc2771804b4c21716a87a4e353504c415348",
    logo: "https://icons.llamao.fi/icons/protocols/splash-protocol",
    color: "#02a9f7",
  },
  {
    id: "vyfi",
    dexName: "VyFinance",
    ticker: "VYFI",
    tokenName: "VyFinance Governance Token",
    description: "Governance and utility token for VyFinance.",
    tokenId: "804f5544c1962a40546827cab750a88404dc7108c0f588b72964754f56594649",
    logo: "https://icons.llamao.fi/icons/protocols/vyfinance",
    color: "#d9a600",
  },
  {
    id: "cswap",
    dexName: "CSWAP",
    ticker: "CSWAP",
    tokenName: "CSWAP Token",
    description: "Utility and governance token for the CSWAP ecosystem.",
    tokenId: "c863ceaa796d5429b526c336ab45016abd636859f331758e67204e5c4353574150",
    logo: "https://icons.llamao.fi/icons/protocols/cswap-dex",
    color: "#00b97d",
  },
] as const satisfies readonly DexTokenConfig[];

export type DexTokenId = (typeof DEX_TOKEN_REGISTRY)[number]["id"];

export function getDexToken(id: string) {
  return DEX_TOKEN_REGISTRY.find((token) => token.id === id) || null;
}
