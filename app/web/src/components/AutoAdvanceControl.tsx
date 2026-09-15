interface Props {
  remainingMs: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  disabled: boolean;
}

// auto条件のフッター操作: 残り時間表示 + 一時停止/再開。速度変更UIは研究中は提供しない。
export function AutoAdvanceControl({ remainingMs, isPaused, onPause, onResume, disabled }: Props) {
  const remainingSec = Math.ceil(remainingMs / 1000);
  return (
    <div className="auto-advance-control">
      <span className="auto-advance-control__label">
        {isPaused ? "一時停止中" : disabled ? "抽選中…" : `次の10連まで ${remainingSec}秒`}
      </span>
      {isPaused ? (
        <button type="button" className="primary-button" onClick={onResume}>
          再開
        </button>
      ) : (
        <button type="button" className="secondary-button" onClick={onPause} disabled={disabled}>
          一時停止
        </button>
      )}
    </div>
  );
}
