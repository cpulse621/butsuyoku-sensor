import type { GemDataset, ProbabilityResult, TargetBloodGem } from "motsuyoku-sensor-core";
import { computeProbability } from "motsuyoku-sensor-core";

// computeProbability(ProbabilityEngine)呼び出し+例外処理を一箇所に集約する。
// ProbabilityPanel表示と、記録機能(useSimulationHistory)での
// theoretical_probability取得の両方から共有して使う。
export type ProbabilityOutcome = { status: "no-target" } | { status: "ok"; result: ProbabilityResult } | { status: "error"; message: string };

export function safeComputeProbability(dataset: GemDataset, target: TargetBloodGem | null): ProbabilityOutcome {
  if (!target) return { status: "no-target" };
  try {
    return { status: "ok", result: computeProbability(dataset, target) };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
