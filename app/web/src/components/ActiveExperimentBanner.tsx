import type { ActiveExperimentSnapshot } from "../storage/researchHistory";
import { effectLabel, enemyLabel } from "../i18n/labels";

interface Props {
  snapshot: ActiveExperimentSnapshot;
  onResume: () => void;
  onDiscard: () => void;
}

// reload時、前回の実験が完了しないまま終わっていた場合に表示するバナー。
export function ActiveExperimentBanner({ snapshot, onResume, onDiscard }: Props) {
  return (
    <div className="card">
      <h3 className="section-title">前回の実験を再開しますか？</h3>
      <p className="hint">
        {enemyLabel(snapshot.enemy_id)} / Target: {effectLabel(snapshot.target.primary_effect_id)}
        {snapshot.target.secondary_effect_id ? ` / 2op: ${effectLabel(snapshot.target.secondary_effect_id)}` : ""} / 欲しさ {snapshot.desire_score}/5
      </p>
      <p className="hint">
        ブラウザの技術的な制約により、再開すると試行回数は0から再カウントされます（Target・欲しさ評価は引き継がれます）。
      </p>
      <div className="pull-controls">
        <button type="button" className="primary-button" onClick={onResume}>
          再開する
        </button>
        <button type="button" className="secondary-button" onClick={onDiscard}>
          破棄する
        </button>
      </div>
    </div>
  );
}
