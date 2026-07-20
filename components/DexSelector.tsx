import { PreserveTerms } from "@/components/PreserveTerms";
import type { DexMetric } from "@/lib/types";

export function DexSelector({
  dexes,
  selected,
  onToggle,
}: {
  dexes: DexMetric[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="dex-selector" aria-label="DEXes shown on charts">
      {dexes.filter((dex) => dex.defillamaVolume7dUsd != null || dex.volume7dUsd != null).map((dex) => (
        <button
          type="button"
          key={dex.id}
          onClick={() => onToggle(dex.id)}
          className={selected.has(dex.id) ? "is-selected" : ""}
          aria-pressed={selected.has(dex.id)}
        >
          <span style={{ background: dex.color }} />
          <PreserveTerms>{dex.name}</PreserveTerms>
        </button>
      ))}
    </div>
  );
}
