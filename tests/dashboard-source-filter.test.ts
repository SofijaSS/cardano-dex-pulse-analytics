import { describe, expect, it } from "vitest";
import { parseCardanoDefillamaProtocols } from "../lib/dashboard-data";

describe("DefiLlama protocol cache projection", () => {
  it("keeps only protocols that expose Cardano data", () => {
    const protocols = parseCardanoDefillamaProtocols([
      {
        name: "Cardano DEX",
        category: "Dexs",
        chains: ["Cardano"],
        tvl: 100,
        chainTvls: { Cardano: 100 },
        logo: "https://example.test/cardano.png",
        largeUnusedPayload: "discarded",
      },
      {
        name: "Cardano TVL fallback",
        category: "Dexs",
        chains: [],
        tvl: 50,
        chainTvls: { Cardano: 50 },
      },
      {
        name: "Ethereum only",
        category: "Dexs",
        chains: ["Ethereum"],
        tvl: 200,
        chainTvls: { Ethereum: 200 },
      },
    ]);

    expect(protocols.map((protocol) => protocol.name)).toEqual([
      "Cardano DEX",
      "Cardano TVL fallback",
    ]);
    expect(protocols[0]).not.toHaveProperty("largeUnusedPayload");
  });
});
