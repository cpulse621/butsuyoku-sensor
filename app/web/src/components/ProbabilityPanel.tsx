import { useMemo } from "react";
import type { GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { computeProbability } from "motsuyoku-sensor-core";
import { formatOneInN, formatProbability, humanizeId } from "../lib/format";

interface Props {
  dataset: GemDataset;
  target: TargetBloodGem | null;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  shape: "形状",
  primaryEffect: "1op効果",
  primaryRank: "1op Value",
  secondaryEffect: "2op効果",
  secondaryRank: "2op Value",
  curse: "呪い",
};

// 出現確率の計算はTargetMatcherではなくCoreのProbabilityEngine(computeProbability)のみを使う。
// ここでは確率の再計算は一切行わず、Coreの戻り値をそのまま整形して表示するだけ。
export function ProbabilityPanel({ dataset, target }: Props) {
  const outcome = useMemo(() => {
    if (!target) return { status: "no-target" as const };
    try {
      const result = computeProbability(dataset, target);
      return { status: "ok" as const, result };
    } catch (err) {
      return { status: "error" as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, [dataset, target]);

  return (
    <div className="card probability-panel">
      <h3 className="section-title">出現確率（ProbabilityEngine）</h3>
      {outcome.status === "no-target" && <p className="hint">Targetを設定すると、ここに理論確率が表示されます。</p>}
      {outcome.status === "error" && (
        <div className="blocker-box">
          <strong>BLOCKER:</strong> {outcome.message}
        </div>
      )}
      {outcome.status === "ok" && (
        <>
          <div className="probability-headline">
            <span className="probability-main">{formatProbability(outcome.result.p)}</span>
            <span className="probability-sub">{formatOneInN(outcome.result.approxOneInN)}</span>
          </div>
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>ステージ</th>
                <th>raw</th>
                <th>排他後(effective)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(outcome.result.breakdown).map(([key, entry]) => (
                <tr key={key}>
                  <td>{BREAKDOWN_LABELS[key] ?? humanizeId(key)}</td>
                  <td>{formatProbability(entry.raw)}</td>
                  <td>{formatProbability(entry.effective)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
