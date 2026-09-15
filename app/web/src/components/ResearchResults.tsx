import type { ProbabilityResult } from "motsuyoku-sensor-core";
import type { ResearchExperiment } from "../storage/researchHistory";
import { effectLabel, shapeLabel, curseLabel, exitReasonLabel, drawAdvanceModeLabel } from "../i18n/labels";
import { formatOneInN, formatProbability } from "../lib/format";
import { cumulativeMatchProbability } from "../lib/probability";

interface Props {
  record: ResearchExperiment;
  probability: ProbabilityResult;
  onStartNew: () => void;
}

// 研究モードの結果画面。事後アンケート完了後(または途中終了後)にのみ到達する。
// 理論確率はProbabilityEngineの結果(probability)をそのまま表示するだけで、ここでは一切再計算しない。
export function ResearchResults({ record, probability, onStartNew }: Props) {
  const cumulative = record.success && record.roll_count ? cumulativeMatchProbability(probability.p, record.roll_count) : null;

  return (
    <div className="card">
      <h3 className="section-title">実験結果</h3>

      <div className="result-status">
        {record.success ? (
          <span className="result-status__badge result-status__badge--success">目的の血晶が出ました</span>
        ) : (
          <span className="result-status__badge result-status__badge--censored">途中で終了しました（未達成）</span>
        )}
      </div>

      <table className="breakdown-table">
        <tbody>
          <tr>
            <td>Target（1op）</td>
            <td>{effectLabel(record.target.primary_effect_id)}</td>
          </tr>
          {record.target.secondary_effect_id && (
            <tr>
              <td>Target（2op）</td>
              <td>{effectLabel(record.target.secondary_effect_id)}</td>
            </tr>
          )}
          <tr>
            <td>Target（形状）</td>
            <td>{record.target.shape.map(shapeLabel).join(" / ")}</td>
          </tr>
          <tr>
            <td>Target（呪い）</td>
            <td>{record.target.accepted_curse_ids.map(curseLabel).join(" / ")}</td>
          </tr>
          <tr>
            <td>欲しさ</td>
            <td>{record.desire_score} / 5</td>
          </tr>
          <tr>
            <td>実際の試行回数</td>
            <td>{record.success ? `${record.roll_count} 回` : `${record.cutoff_draws} 回（未達成のため打ち切り）`}</td>
          </tr>
          <tr>
            <td>進行方式</td>
            <td>{drawAdvanceModeLabel(record.draw_advance_mode)}</td>
          </tr>
          {record.draw_advance_mode === "auto" && (
            <tr>
              <td>一時停止</td>
              <td>
                {record.pause_count}回（合計 {Math.round(record.paused_duration_ms / 1000)}秒）
              </td>
            </tr>
          )}
          {record.exit_reason !== null && (
            <tr>
              <td>終了した主な理由</td>
              <td>{exitReasonLabel(record.exit_reason)}</td>
            </tr>
          )}
          <tr>
            <td>理論確率 p</td>
            <td>{formatProbability(probability.p)}</td>
          </tr>
          <tr>
            <td>約1/N</td>
            <td>{formatOneInN(probability.approxOneInN)}</td>
          </tr>
          <tr>
            <td>期待試行回数（1/p）</td>
            <td>{formatOneInN(probability.approxOneInN)}</td>
          </tr>
          {cumulative !== null && (
            <tr>
              <td>この回数までに1回以上出ている確率</td>
              <td>{formatProbability(cumulative)}</td>
            </tr>
          )}
          {record.tedious_score !== null && (
            <tr>
              <td>面倒・長いと感じたか</td>
              <td>{record.tedious_score} / 5</td>
            </tr>
          )}
          {record.real_game_burden_score !== null && (
            <tr>
              <td>実ゲームでの苦痛度</td>
              <td>{record.real_game_burden_score} / 5</td>
            </tr>
          )}
          {record.sensor_score !== null && (
            <tr>
              <td>物欲センサーの実感</td>
              <td>{record.sensor_score} / 5</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="hint">このブラウザに保存済みです。外部サーバーには未送信です。</p>

      <button type="button" className="primary-button" onClick={onStartNew}>
        新しい実験を始める
      </button>
    </div>
  );
}
