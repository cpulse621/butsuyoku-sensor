import type { BloodGem, GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { isMatch } from "motsuyoku-sensor-core";
import { formatEffectValue } from "../lib/format";
import { curseLabel, effectLabel, matchStatusLabel, shapeLabel } from "../i18n/labels";

interface Props {
  dataset: GemDataset;
  gems: BloodGem[];
  target: TargetBloodGem | null;
}

// 10連結果の表示。M3E上の104x54pxはあくまでレイアウト確認用の目安値であり、
// ここでは固定pxサイズにはせず、CSS Grid(5列×2行を基本)で右ペイン幅から自動計算する。
// 一致判定はTargetMatcher(isMatch)のみを使い、ここでは判定ロジックを再実装しない。
export function DrawResultsGrid({ dataset, gems, target }: Props) {
  if (gems.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title">10連結果（DrawEngine）</h3>
        <p className="hint">「10連する」を押すと、ここに結果が表示されます。</p>
      </div>
    );
  }

  const hasSecondary = dataset.enemy.secondarySlot !== "none";

  return (
    <div className="card">
      <h3 className="section-title">10連結果（DrawEngine）</h3>
      <div className="pull-grid">
        {gems.map((gem, i) => {
          const matched = target ? isMatch(gem, target) : null;
          const primaryValue = formatEffectValue(dataset, "primary", gem.primaryEffectId, gem.primaryValueRank);
          const secondaryValue =
            hasSecondary && gem.secondaryEffectId !== null && gem.secondaryValueRank !== null
              ? formatEffectValue(dataset, "secondary", gem.secondaryEffectId, gem.secondaryValueRank)
              : null;
          return (
            <div key={i} className={`pull-cell ${matched ? "pull-cell--match" : ""}`}>
              <div className="pull-cell__index">#{i + 1}</div>
              <div className="pull-cell__row">{shapeLabel(gem.shapeId)}</div>
              <div className="pull-cell__row">
                {effectLabel(gem.primaryEffectId)} {primaryValue.text}
              </div>
              {hasSecondary && (
                <div className="pull-cell__row">
                  {gem.secondaryEffectId ? `${effectLabel(gem.secondaryEffectId)} ${secondaryValue?.text ?? ""}` : "—"}
                </div>
              )}
              <div className="pull-cell__row">呪い: {curseLabel(gem.curseId)}</div>
              <div className={`pull-cell__badge ${matched ? "pull-cell__badge--match" : matched === false ? "pull-cell__badge--miss" : ""}`}>
                {matched === null ? "Target未設定" : matchStatusLabel(matched)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
