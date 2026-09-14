import type { GemDataset, ResearchTargetCatalogEntry } from "motsuyoku-sensor-core";
import { humanizeId } from "../lib/format";
import { RankMultiSelect } from "./RankMultiSelect";

interface Props {
  dataset: GemDataset;
  slot: "primary" | "secondary";
  title: string;
  catalog: ResearchTargetCatalogEntry[];
  selectedEffectId: string | null;
  onSelectEffect: (effectId: string) => void;
  selectedRanks: number[];
  onToggleRank: (rank: number) => void;
  fallbackRankTiers: number[];
}

// primary、および貞子のような selectable secondary の効果選択UI。
// 「Valueを1つ以上持つeffectを通常の選択肢として優先表示」の指示に従い、
// exactValueSelectable な効果を先に並べる(非表示にはしない)。
export function EffectSlotEditor({
  dataset,
  slot,
  title,
  catalog,
  selectedEffectId,
  onSelectEffect,
  selectedRanks,
  onToggleRank,
  fallbackRankTiers,
}: Props) {
  const sorted = [...catalog].sort((a, b) => {
    if (a.exactValueSelectable !== b.exactValueSelectable) return a.exactValueSelectable ? -1 : 1;
    return a.effectId.localeCompare(b.effectId);
  });

  const selectedEntry = catalog.find((c) => c.effectId === selectedEffectId);

  return (
    <div className="card">
      <h3 className="section-title">{title}</h3>
      <div className="chip-row chip-row--wrap">
        {sorted.map((entry) => (
          <button
            key={entry.effectId}
            type="button"
            className={`chip ${selectedEffectId === entry.effectId ? "chip--selected" : ""} ${
              !entry.exactValueSelectable ? "chip--muted" : ""
            }`}
            aria-pressed={selectedEffectId === entry.effectId}
            title={entry.exactValueSelectable ? "数値検証済みの値あり" : "数値未検証（effectId一致のみで選択可）"}
            onClick={() => onSelectEffect(entry.effectId)}
          >
            {humanizeId(entry.effectId)}
            {!entry.exactValueSelectable && <span className="chip-badge">未検証</span>}
          </button>
        ))}
        {sorted.length === 0 && <p className="hint">選択可能な効果がありません（BLOCKER: データ不足の可能性）</p>}
      </div>

      {selectedEffectId && (
        <div className="rank-section">
          <span className="rank-label">許容Value:</span>
          <RankMultiSelect
            dataset={dataset}
            slot={slot}
            effectId={selectedEffectId}
            catalogEntry={selectedEntry}
            fallbackRankTiers={fallbackRankTiers}
            selectedRanks={selectedRanks}
            onToggleRank={onToggleRank}
          />
        </div>
      )}
    </div>
  );
}
