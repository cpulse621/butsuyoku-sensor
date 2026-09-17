import { useState } from "react";
import { ScoreSelector } from "./ScoreSelector";
import { PerceivedRarityInput } from "./PerceivedRarityInput";

export interface SurveyFormAnswers {
  tediousnessScore: 1 | 2 | 3 | 4 | 5;
  painIfRepeatedScore: 1 | 2 | 3 | 4 | 5;
  sensorScore: 1 | 2 | 3 | 4 | 5;
  effortRewardFitScore: 1 | 2 | 3 | 4 | 5;
  // 「わからない」を選んだ場合はnull(指示1節: 無理に推測値を選ばせない)。
  perceivedExpectedDraws: number | null;
}

interface Props {
  onSubmit: (answers: SurveyFormAnswers) => void;
}

// MATCH後(または途中終了後)の事後アンケート。5問すべてに回答するまで「結果を見る」は押せない。
// この時点ではまだ理論確率を一切表示しない。
// 順序は固定(指示C・D節): Q1 tedious → Q2 real_game_burden → Q3 sensor → Q4 effort/reward fit
// → Q5 perceived rarity。Q4をQ3より前に置く、あるいはQ5で理論値のヒントを与えることは、
// sensor_scoreの回答を誘導しかねないため禁止する。
export function SurveyForm({ onSubmit }: Props) {
  const [q1, setQ1] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [q2, setQ2] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [q3, setQ3] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [q4, setQ4] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  // q5AnsweredとQ5(値)を分離する: 「わからない」を選ぶとq5=nullのまま回答済みになるため、
  // 「まだ回答していない(送信不可)」と「わからないと回答した(送信可)」を区別する必要がある。
  const [q5Answered, setQ5Answered] = useState(false);
  const [q5, setQ5] = useState<number | null>(null);

  const canSubmit = q1 !== null && q2 !== null && q3 !== null && q4 !== null && q5Answered;

  return (
    <div className="card">
      <h3 className="section-title">結果を見る前に、5つの質問にお答えください</h3>
      <p className="hint">出現確率は、この5問に回答した後に表示されます。</p>

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

      <div className="survey-question">
        <p className="survey-question__text">Q4. 今回の結果は、かけた時間や手間にどの程度見合っていたと感じましたか？</p>
        <ScoreSelector value={q4} onChange={setQ4} lowLabel="まったく見合っていなかった" highLabel="とても見合っていた" />
      </div>

      <div className="survey-question">
        <p className="survey-question__text">Q5. 今回のTargetは、平均すると何回に1回くらい出ると思いましたか？</p>
        <PerceivedRarityInput
          answered={q5Answered}
          value={q5}
          onChange={(v) => {
            setQ5(v);
            setQ5Answered(true);
          }}
        />
      </div>

      <button
        type="button"
        className="primary-button"
        disabled={!canSubmit}
        onClick={() => {
          if (q1 !== null && q2 !== null && q3 !== null && q4 !== null && q5Answered) {
            onSubmit({
              tediousnessScore: q1,
              painIfRepeatedScore: q2,
              sensorScore: q3,
              effortRewardFitScore: q4,
              perceivedExpectedDraws: q5,
            });
          }
        }}
      >
        結果を見る
      </button>
    </div>
  );
}
