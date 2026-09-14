interface Props {
  sessionTotalDraws: number;
  lastError: string | null;
  onOpenHistory: () => void;
}

// 「シミュレーターモードで記録中であること」「今のところローカル保存のみであること」を
// 誤解なく伝えるための、常時表示のステータス行。
export function RecordingStatusBar({ sessionTotalDraws, lastError, onOpenHistory }: Props) {
  return (
    <div className="recording-status-bar">
      <div className="recording-status-bar__main">
        <span className="recording-status-bar__mode">シミュレーターモード</span>
        <span className="recording-status-bar__dot">
          <span className="recording-status-bar__dot-mark" aria-hidden="true">
            ●
          </span>
          この端末に記録中
        </span>
        <span className="recording-status-bar__count">セッション抽選数: {sessionTotalDraws}</span>
        <button type="button" className="link-button" onClick={onOpenHistory}>
          履歴
        </button>
      </div>
      <p className="recording-status-bar__note">この記録は現在このブラウザ内にのみ保存されています（外部サーバーへの送信はまだ行われていません）</p>
      {lastError && (
        <div className="blocker-box">
          <strong>記録できませんでした:</strong> {lastError}
        </div>
      )}
    </div>
  );
}
