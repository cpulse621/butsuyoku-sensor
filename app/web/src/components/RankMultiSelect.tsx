import type { GemDataset, ResearchTargetCatalogEntry } from "motsuyoku-sensor-core";
import { formatEffectValue } from "../lib/format";

interface Props {
  dataset: GemDataset;
  slot: "primary" | "secondary";
  effectId: string;
  catalogEntry: ResearchTargetCatalogEntry | undefined;
  fallbackRankTiers: number[];
  selectedRanks: number[];
  onToggleRank: (rank: number) => void;
}

// 「利用可能なValueが複数あれば複数選択、1つだけなら自動選択」というルール(女幽霊2opの指示を
// 一般化したもの)をUI側で表現するコンポーネント。数値の確定判定自体はCoreのカタログに従うのみ。
export function RankMultiSelect({ dataset, slot, effectId, catalogEntry, fallbackRankTiers, selectedRanks, onToggleRank }: Props) {
  if (!catalogEntry?.exactValueSelectable) {
    return (
      <p className="rank-note">
        数値未検証のため、ランク不問（{fallbackRankTiers.join("/")} のいずれでもeffectId一致のみで成立）
      </p>
    );
  }

  const ranks = catalogEntry.confirmedRanks.map((r) => r.rank).sort((a, b) => a - b);

  return (
    <div className="chip-row" role="group" aria-label={`${effectId} の許容Value`}>
      {ranks.map((rank) => {
        const formatted = formatEffectValue(dataset, slot, effectId, rank);
        const checked = selectedRanks.includes(rank);
        return (
          <button
            key={rank}
            type="button"
            className={`chip ${checked ? "chip--selected" : ""}`}
            aria-pressed={checked}
            onClick={() => onToggleRank(rank)}
          >
            {formatted.text}
          </button>
        );
      })}
      {ranks.length === 1 && <span className="hint">（利用可能な値が1つのため自動選択）</span>}
    </div>
  );
}
