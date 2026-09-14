interface Props {
  value: number | null;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
  lowLabel: string;
  highLabel: string;
}

// 1〜5の主観評価入力。欲しさ評価・事後アンケート3問すべてで共通利用する。
export function ScoreSelector({ value, onChange, lowLabel, highLabel }: Props) {
  return (
    <div className="score-selector">
      <div className="score-selector__row">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`score-button ${value === n ? "score-button--selected" : ""}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="score-selector__captions">
        <span>
          1: {lowLabel}
        </span>
        <span>
          5: {highLabel}
        </span>
      </div>
    </div>
  );
}
