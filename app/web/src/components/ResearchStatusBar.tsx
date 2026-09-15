interface Props {
  phase: "idle" | "running" | "awaiting_survey" | "awaiting_exit_reason" | "revealed";
  rollCount: number;
  onOpenHistory: () => void;
}

const ACTIVE_PHASES = ["running", "awaiting_survey", "awaiting_exit_reason"];

// 研究モードの記録状態表示(指示PHASE9)。
// 「送信済み」と誤解されないよう、実験中/終了後のいずれも「未送信」であることを明示する。
export function ResearchStatusBar({ phase, rollCount, onOpenHistory }: Props) {
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
        {phase === "revealed"
          ? "このブラウザに保存済みです。外部サーバーには未送信です。"
          : "この記録はこのブラウザ内にのみ保存されます。外部サーバーには送信されません。"}
      </p>
    </div>
  );
}
