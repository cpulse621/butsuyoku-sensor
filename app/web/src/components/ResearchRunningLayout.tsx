import type { GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import type { RevealedEntry } from "../hooks/useResearchSession";
import { effectLabel, shapeLabel, curseLabel } from "../i18n/labels";
import { ResearchRevealGrid } from "./ResearchRevealGrid";
import { AutoAdvanceControl } from "./AutoAdvanceControl";

interface Props {
  dataset: GemDataset;
  target: TargetBloodGem;
  rollCount: number;
  elapsedMs: number;
  drawAdvanceMode: "manual" | "auto";
  autoRemainingMs: number;
  isAutoPaused: boolean;
  isRevealing: boolean;
  currentBatchRevealed: RevealedEntry[];
  resumedProgressReset: boolean;
  onRevealBatch: () => void;
  onPauseAuto: () => void;
  onResumeAuto: () => void;
  onGiveUp: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 研究開始後の実験専用レイアウト。manual/authoの両条件で
// 「Target設定欄の編集」「スクロール操作」を一切不要にし、
// 常に同一画面内で: 現在のTarget / 試行回数 / 経過時間 / 今回の結果 / 次の10連 / 途中終了
// が操作できる状態を保つ。PCでは結果を中央、Target概要を右、操作を下部固定にする。
export function ResearchRunningLayout({
  dataset,
  target,
  rollCount,
  elapsedMs,
  drawAdvanceMode,
  autoRemainingMs,
  isAutoPaused,
  isRevealing,
  currentBatchRevealed,
  resumedProgressReset,
  onRevealBatch,
  onPauseAuto,
  onResumeAuto,
  onGiveUp,
}: Props) {
  function handleGiveUpClick() {
    const confirmed = window.confirm("目的の血晶が出る前に実験を終了しますか？");
    if (confirmed) onGiveUp();
  }

  return (
    <div className="research-run-shell">
      <div className="research-run-shell__header">
        <span className="recording-status-bar__mode">研究モード</span>
        <span className="recording-status-bar__dot">
          <span className="recording-status-bar__dot-mark" aria-hidden="true">
            ●
          </span>
          実験を記録中
        </span>
        <span className="recording-status-bar__count">試行回数: {rollCount}</span>
        <span className="recording-status-bar__count">経過時間: {formatElapsed(elapsedMs)}</span>
      </div>

      {resumedProgressReset && (
        <div className="blocker-box research-run-shell__notice">
          前回の実験を再開しました。ブラウザの技術的な制約により、試行回数・経過時間・一時停止回数は0から再カウントされます（Target・欲しさ評価・manual/auto条件は引き継がれています）。
        </div>
      )}

      <div className="research-run-shell__body">
        <div className="research-run-shell__results">
          <ResearchRevealGrid dataset={dataset} revealed={currentBatchRevealed} />
        </div>

        <div className="research-run-shell__sidebar">
          <div className="card">
            <h3 className="section-title">今回のTarget</h3>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td>形状</td>
                  <td>{target.acceptedShapes.map(shapeLabel).join(" / ")}</td>
                </tr>
                <tr>
                  <td>1op</td>
                  <td>{effectLabel(target.primaryEffectId)}</td>
                </tr>
                {target.secondaryEffectId && (
                  <tr>
                    <td>2op</td>
                    <td>{effectLabel(target.secondaryEffectId)}</td>
                  </tr>
                )}
                <tr>
                  <td>呪い</td>
                  <td>{target.acceptedCurses.map(curseLabel).join(" / ")}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">実験中はTargetを変更できません。</p>
          </div>

          <div className="card">
            <p className="hint">出現確率は実験終了後に表示されます。</p>
          </div>
        </div>
      </div>

      <div className="research-run-shell__footer">
        {drawAdvanceMode === "manual" ? (
          <button type="button" className="primary-button research-run-shell__advance" onClick={onRevealBatch} disabled={isRevealing}>
            {isRevealing ? "抽選中…" : "次の10連"}
          </button>
        ) : (
          <AutoAdvanceControl
            remainingMs={autoRemainingMs}
            isPaused={isAutoPaused}
            onPause={onPauseAuto}
            onResume={onResumeAuto}
            disabled={isRevealing}
          />
        )}
        <button type="button" className="danger-button" onClick={handleGiveUpClick} disabled={isRevealing}>
          実験を終了する
        </button>
      </div>
    </div>
  );
}
