import type { GemDataset } from "motsuyoku-sensor-core";
import type { RevealedEntry } from "../hooks/useResearchSession";
import { curseLabel, effectLabel, matchStatusLabel, shapeLabel } from "../i18n/labels";
import { formatEffectValue } from "../lib/format";

interface Props {
  dataset: GemDataset;
  rollCount: number;
  elapsedMs: number;
  isRevealing: boolean;
  currentBatchRevealed: RevealedEntry[];
  onRevealBatch: () => void;
  onGiveUp: () => void;
  resumedRollCountReset: boolean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

// 実験中の画面。研究モードでは理論確率・約1/N・期待値は一切表示しない(仕様PHASE4)。
// 表示してよいのは現在の試行回数と経過時間のみ。
export function RunningExperimentView({
  dataset,
  rollCount,
  elapsedMs,
  isRevealing,
  currentBatchRevealed,
  onRevealBatch,
  onGiveUp,
  resumedRollCountReset,
}: Props) {
  const hasSecondary = dataset.enemy.secondarySlot !== "none";

  function handleGiveUp() {
    const confirmed = window.confirm("目的の血晶が出る前に実験を終了しますか？");
    if (confirmed) onGiveUp();
  }

  return (
    <div className="card">
      <h3 className="section-title">実験中</h3>

      {resumedRollCountReset && (
        <div className="blocker-box">
          前回の実験を再開しました。ブラウザの技術的な制約により、この端末では試行回数が0から再カウントされます（元のTarget・欲しさ評価は引き継がれています）。
        </div>
      )}

      <div className="probability-headline">
        <span className="probability-main">試行回数: {rollCount}</span>
        <span className="probability-sub">経過時間: {formatElapsed(elapsedMs)}</span>
      </div>

      <div className="card probability-panel" style={{ background: "transparent", padding: 0 }}>
        <p className="hint">出現確率は実験終了後に表示されます。</p>
      </div>

      <div className="reveal-list">
        {currentBatchRevealed.map((entry, i) => {
          const primaryValue = formatEffectValue(dataset, "primary", entry.gem.primaryEffectId, entry.gem.primaryValueRank);
          return (
            <div key={i} className={`reveal-row ${entry.matched ? "reveal-row--match" : ""}`}>
              <span className="reveal-row__index">#{entry.rollCount}</span>
              <span>{shapeLabel(entry.gem.shapeId)}</span>
              <span>
                {effectLabel(entry.gem.primaryEffectId)} {primaryValue.text}
              </span>
              {hasSecondary && entry.gem.secondaryEffectId && <span>{effectLabel(entry.gem.secondaryEffectId)}</span>}
              <span>{curseLabel(entry.gem.curseId)}</span>
              {entry.matched && <span className="reveal-row__badge">{matchStatusLabel(true)}</span>}
            </div>
          );
        })}
      </div>

      <div className="pull-controls">
        <button type="button" className="primary-button" onClick={onRevealBatch} disabled={isRevealing}>
          {isRevealing ? "抽選中…" : "10回抽選"}
        </button>
        <button type="button" className="danger-button" onClick={handleGiveUp} disabled={isRevealing}>
          実験を終了する / 諦める
        </button>
      </div>
    </div>
  );
}
