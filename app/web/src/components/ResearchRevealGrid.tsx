import type { GemDataset } from "motsuyoku-sensor-core";
import type { RevealedEntry } from "../hooks/useResearchSession";
import { curseLabel, effectLabel, matchStatusLabel, shapeLabel } from "../i18n/labels";
import { formatEffectValue } from "../lib/format";

interface Props {
  dataset: GemDataset;
  revealed: RevealedEntry[];
}

// simulatorのDrawResultsGridと同じ視覚言語(5x2グリッド)を使う。
// ここではisMatchを再計算せず、Core(revealNext)がすでに返したmatchedをそのまま表示するだけ。
// 確率の数値は一切表示しない(研究モードでは実験終了まで非公開)。
export function ResearchRevealGrid({ dataset, revealed }: Props) {
  if (revealed.length === 0) {
    return (
      <div className="research-reveal-empty">
        <p className="hint">「次の10連」を押す(またはauto条件では自動的に)と、ここに結果が表示されます。</p>
      </div>
    );
  }

  const hasSecondary = dataset.enemy.secondarySlot !== "none";

  return (
    <div className="pull-grid">
      {revealed.map((entry) => {
        const { gem } = entry;
        const primaryValue = formatEffectValue(dataset, "primary", gem.primaryEffectId, gem.primaryValueRank);
        const secondaryValue =
          hasSecondary && gem.secondaryEffectId !== null && gem.secondaryValueRank !== null
            ? formatEffectValue(dataset, "secondary", gem.secondaryEffectId, gem.secondaryValueRank)
            : null;
        return (
          <div key={entry.rollCount} className={`pull-cell ${entry.matched ? "pull-cell--match" : ""}`}>
            <div className="pull-cell__index">#{entry.rollCount}</div>
            <div className="pull-cell__row">{shapeLabel(gem.shapeId)}</div>
            <div className="pull-cell__row">
              {effectLabel(gem.primaryEffectId)} {primaryValue.text}
            </div>
            {hasSecondary && (
              <div className="pull-cell__row">{gem.secondaryEffectId ? `${effectLabel(gem.secondaryEffectId)} ${secondaryValue?.text ?? ""}` : "—"}</div>
            )}
            <div className="pull-cell__row">呪い: {curseLabel(gem.curseId)}</div>
            <div className={`pull-cell__badge ${entry.matched ? "pull-cell__badge--match" : "pull-cell__badge--miss"}`}>
              {matchStatusLabel(entry.matched)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
