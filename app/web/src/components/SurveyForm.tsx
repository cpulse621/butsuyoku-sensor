import { useState } from "react";
import { ScoreSelector } from "./ScoreSelector";

interface Props {
  onSubmit: (answers: { tediousnessScore: 1 | 2 | 3 | 4 | 5; painIfRepeatedScore: 1 | 2 | 3 | 4 | 5; sensorScore: 1 | 2 | 3 | 4 | 5 }) => void;
}

// MATCH後(または途中終了後)の事後アンケート。3問すべてに回答するまで「結果を見る」は押せない。
// この時点ではまだ理論確率を一切表示しない。
export function SurveyForm({ onSubmit }: Props) {
  const [q1, setQ1] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [q2, setQ2] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [q3, setQ3] = useState<1 | 2 | 3 | 4 | 5 | null>(null);

  const canSubmit = q1 !== null && q2 !== null && q3 !== null;

  return (
    <div className="card">
      <h3 className="section-title">結果を見る前に、3つの質問にお答えください</h3>
      <p className="hint">出現確率は、この3問に回答した後に表示されます。</p>

      <div className="survey-question">
        <p className="survey-question__text">Q1. 今回の抽選を面倒・長いと感じましたか？</p>
        <ScoreSelector value={q1} onChange={setQ1} lowLabel="全く感じなかった" highLabel="非常に感じた" />
      </div>

      <div className="survey-question">
        <p className="survey-question__text">Q2. 実際のゲームで同じ回数だけ周回するとしたら、どの程度苦痛だと思いますか？</p>
        <ScoreSelector value={q2} onChange={setQ2} lowLabel="全く苦痛でない" highLabel="非常に苦痛" />
      </div>

      <div className="survey-question">
        <p className="survey-question__text">Q3. 今回、物欲センサーをどの程度感じましたか？</p>
        <ScoreSelector value={q3} onChange={setQ3} lowLabel="全く感じなかった" highLabel="非常に感じた" />
      </div>

      <button
        type="button"
        className="primary-button"
        disabled={!canSubmit}
        onClick={() => {
          if (q1 !== null && q2 !== null && q3 !== null) {
            onSubmit({ tediousnessScore: q1, painIfRepeatedScore: q2, sensorScore: q3 });
          }
        }}
      >
        結果を見る
      </button>
    </div>
  );
}
