import type { StoredTarget } from "../storage/simulationHistory";
import { listRecentTargets } from "../storage/recentTargets";
import { curseLabel, effectLabel, shapeLabel } from "../i18n/labels";

interface Props {
  datasetId: string;
  onApply: (target: StoredTarget) => void;
}

function summarize(target: StoredTarget): string {
  const parts = [target.shape.map(shapeLabel).join("/"), effectLabel(target.primary_effect_id)];
  if (target.secondary_effect_id) parts.push(effectLabel(target.secondary_effect_id));
  parts.push(target.accepted_curse_ids.map(curseLabel).join("/"));
  return parts.join(" ・ ");
}

// Target設定を高速化するための「最近使ったTarget」一覧。保存はeffectId等のIDのみで行い、
// ここでは表示時にラベルへ変換するだけ(データとして日本語文字列は保持しない)。
export function RecentTargetsPanel({ datasetId, onApply }: Props) {
  const entries = listRecentTargets(datasetId);
  if (entries.length === 0) return null;

  return (
    <div className="card">
      <h3 className="section-title">最近使ったTarget</h3>
      <div className="recent-target-list">
        {entries.map((entry, i) => (
          <div key={i} className="recent-target-card">
            <span className="recent-target-card__summary">{summarize(entry.target)}</span>
            <button type="button" className="link-button" onClick={() => onApply(entry.target)}>
              この条件を使う
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
