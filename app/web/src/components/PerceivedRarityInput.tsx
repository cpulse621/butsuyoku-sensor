import { useState } from "react";

// Q5: 「平均すると何回に1回くらい出ると思ったか」の主観的な期待試行回数。
// expected_draws(理論値)と同じ単位で直接比較したいため、1〜5の主観評価ではなく
// 「何回に1回」の数値そのものを尋ねる。自由記入の数値入力は桁の見積もりが極端に歪みやすいため、
// 1-2-5系列の対数的な離散ステップで選べるスライダーにする(指示1節でこの系列に確定)。
export const PERCEIVED_RARITY_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000] as const;

// 「わからない」場合はnullとして保存し、無理に推測値を選ばせない(指示1節)。
// value/onChangeのnullは「わからない」を表す。「まだ何も回答していない」状態は
// 親(SurveyForm)側でanswered相当のフラグとして別管理する(このコンポーネントはvalue=nullと
// 「未回答」を区別する必要があるため、answeredを明示的に受け取る)。
interface Props {
  answered: boolean;
  value: number | null;
  onChange: (value: number | null) => void;
}

function formatStep(n: number): string {
  return `約${n.toLocaleString("ja-JP")}回に1回`;
}

export function PerceivedRarityInput({ answered, value, onChange }: Props) {
  const initialIndex = value !== null ? PERCEIVED_RARITY_STEPS.indexOf(value as (typeof PERCEIVED_RARITY_STEPS)[number]) : -1;
  const [index, setIndex] = useState<number>(initialIndex >= 0 ? initialIndex : 0);
  const isUnknown = answered && value === null;

  function handleSliderChange(nextIndex: number) {
    setIndex(nextIndex);
    onChange(PERCEIVED_RARITY_STEPS[nextIndex]);
  }

  return (
    <div className="perceived-rarity-input">
      <input
        type="range"
        min={0}
        max={PERCEIVED_RARITY_STEPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => handleSliderChange(Number(e.target.value))}
        disabled={isUnknown}
        aria-label="今回のTargetは平均何回に1回くらい出ると思ったか"
      />
      <div className="perceived-rarity-input__row">
        <p className="perceived-rarity-input__value">
          {!answered ? "スライダーを動かして回答してください" : isUnknown ? "わからない" : formatStep(PERCEIVED_RARITY_STEPS[index])}
        </p>
        <button
          type="button"
          className={`chip ${isUnknown ? "chip--selected" : ""}`}
          aria-pressed={isUnknown}
          onClick={() => onChange(null)}
        >
          わからない
        </button>
      </div>
    </div>
  );
}
