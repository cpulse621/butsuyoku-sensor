import type { GemDataset, ResearchTargetCatalogEntry } from "motsuyoku-sensor-core";
import { effectLabel } from "../i18n/labels";
import { RankMultiSelect } from "./RankMultiSelect";

interface Props {
  dataset: GemDataset;
  catalogEntry: ResearchTargetCatalogEntry | undefined;
  effectId: string;
  selectedRanks: number[];
  onToggleRank: (rank: number) => void;
  fallbackRankTiers: number[];
}

// 女幽霊の2op(secondary)専用: 効果自体は poorman_physical に固定・読み取り専用で変更不可。
// ただしValue Rankは、Core上で利用可能な値が複数あれば複数選択できる構造にする
// (現時点ではCoreデータ上 R17 のみ確定のため、自動的に1択になる)。
export function FixedSecondaryEditor({ dataset, catalogEntry, effectId, selectedRanks, onToggleRank, fallbackRankTiers }: Props) {
  return (
    <div className="card">
      <h3 className="section-title">2op（Secondary Effect）</h3>
      <div className="fixed-effect-display">
        <span className="chip chip--selected chip--readonly">{effectLabel(effectId)}</span>
        <span className="hint">固定（種類抽選なし）</span>
      </div>
      <div className="rank-section">
        <span className="rank-label">許容Value:</span>
        <RankMultiSelect
          dataset={dataset}
          slot="secondary"
          effectId={effectId}
          catalogEntry={catalogEntry}
          fallbackRankTiers={fallbackRankTiers}
          selectedRanks={selectedRanks}
          onToggleRank={onToggleRank}
        />
      </div>
    </div>
  );
}
