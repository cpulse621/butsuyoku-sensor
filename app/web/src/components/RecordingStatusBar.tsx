interface Props {
  sessionTotalDraws: number;
  sessionMatchCount: number;
  lastError: string | null;
  onOpenHistory: () => void;
}

// 「シミュレーターモードで記録中であること」「今のところローカル保存のみであること」を
// 誤解なく伝えるための、常時表示のステータス行。
export function RecordingStatusBar({ sessionTotalDraws, sessionMatchCount, lastError, onOpenHistory }: Props) {
  return (
    <div className="recording-status-bar">
      <div className="recording-status-bar__main">
        <span className="recording-status-bar__mode">シミュレーターモード</span>
        <span className="recording-status-bar__dot">
          <span className="recording-status-bar__dot-mark" aria-hidden="true">
            ●
          </span>
          このブラウザに履歴を保存しています
        </span>
        <span className="recording-status-bar__count">セッション抽選数: {sessionTotalDraws}</span>
        <span className="recording-status-bar__count">一致数: {sessionMatchCount}</span>
        <button type="button" className="link-button" onClick={onOpenHistory}>
          履歴
        </button>
      </div>
      <p className="recording-status-bar__note">
        この記録はこのブラウザ内にのみ保存されています。サーバーや研究データベースには送信されていません。
      </p>
      {lastError && (
        <div className="blocker-box">
          <strong>記録できませんでした:</strong> {lastError}
        </div>
      )}
    </div>
  );
}
