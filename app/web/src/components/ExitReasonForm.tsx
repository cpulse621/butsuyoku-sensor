import { useState } from "react";
import type { ExitReason } from "../storage/researchHistory";

interface Props {
  onSubmit: (reason: ExitReason) => void;
}

const OPTIONS: { value: ExitReason; label: string }[] = [
  { value: "no_target", label: "なかなか目的の血晶が出なかった" },
  { value: "tedious", label: "抽選操作が面倒になった" },
  { value: "time_limit", label: "時間の都合" },
  { value: "lost_motivation", label: "実験を続ける気がなくなった" },
  { value: "other", label: "その他" },
];

// 途中終了時のみ、事後アンケート(3問)の直後に尋ねる。
// 物欲センサー評価より先に理由を聞くと回答を誘導しかねないため、必ずsensor_score回答後に表示する。
export function ExitReasonForm({ onSubmit }: Props) {
  const [selected, setSelected] = useState<ExitReason | null>(null);

  return (
    <div className="card">
      <h3 className="section-title">実験を終了した主な理由を教えてください</h3>
      <p className="hint">最も近いものを1つ選んでください（自由記述は不要です）。</p>
      <div className="chip-row chip-row--wrap">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`chip ${selected === opt.value ? "chip--selected" : ""}`}
            aria-pressed={selected === opt.value}
            onClick={() => setSelected(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={selected === null}
        onClick={() => {
          if (selected !== null) onSubmit(selected);
        }}
      >
        回答して結果を見る
      </button>
    </div>
  );
}
