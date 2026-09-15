import type { SubmissionStatus } from "../storage/researchHistory";
import { submissionStatusLabel } from "../i18n/labels";

interface Props {
  phase: "idle" | "running" | "awaiting_survey" | "awaiting_exit_reason" | "revealed";
  rollCount: number;
  onOpenHistory: () => void;
  // revealed到達後の、今回の実験の実際の送信状態。sent/failed等をここで正確に反映する
  // (endpoint接続前の固定文言「外部サーバーには未送信」をそのまま出し続けると、
  //  実際に送信済みの場合に誤情報になるため)。
  submissionStatus?: SubmissionStatus | null;
}

const ACTIVE_PHASES = ["running", "awaiting_survey", "awaiting_exit_reason"];

// 研究モードの記録状態表示(指示PHASE9)。参加者に技術用語を出しすぎず、
// 実際の送信状態(sent/pending/failed/local_only)を正確に伝える。
export function ResearchStatusBar({ phase, rollCount, onOpenHistory, submissionStatus }: Props) {
  const isActive = ACTIVE_PHASES.includes(phase);
  return (
    <div className="recording-status-bar">
      <div className="recording-status-bar__main">
        <span className="recording-status-bar__mode">研究モード</span>
        {isActive ? (
          <span className="recording-status-bar__dot">
            <span className="recording-status-bar__dot-mark" aria-hidden="true">
              ●
            </span>
            実験を記録中
          </span>
        ) : (
          <span className="recording-status-bar__dot recording-status-bar__dot--idle">記録待機中</span>
        )}
        {isActive && <span className="recording-status-bar__count">試行回数: {rollCount}</span>}
        <button type="button" className="link-button" onClick={onOpenHistory}>
          研究履歴
        </button>
      </div>
      <p className="recording-status-bar__note">
        {phase === "revealed" && submissionStatus
          ? submissionStatusLabel(submissionStatus)
          : "この記録はこのブラウザ内にのみ保存されます。実験終了後、送信先が設定されていれば研究データベースへの送信を試みます。"}
      </p>
    </div>
  );
}
