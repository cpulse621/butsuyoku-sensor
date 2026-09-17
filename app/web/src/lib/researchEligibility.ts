// 研究モードでTargetとして選択できる上限(expected_draws <= 1,000)。
//
// 重要: これはTarget選択UI(研究モードのみ)にかけるfilterであり、DrawEngineの抽選プールや
// ProbabilityEngineの確率計算には一切影響しない。Simulator modeにはこの上限を適用しない
// (Simulator modeでは低確率なTargetも自由に設定・確認できる)。
//
// この値は、coinシステム(initial_coin=100,000 / base=100)を用いたシミュレーションで、
// expected_draws≈1,000のTargetは「過半数(約63%)が成功しつつ、約4割弱がcoin_exhaustedを
// 経験する」バランス点であることを確認して決定した(docs/experiment_ui_flow_spec.md 3.8.2節)。
//
// 研究モードのTarget設定画面では、この判定結果(選択可否)だけを使い、実際のp/expected_draws
// の数値そのものは参加者へ開示しない(理論確率は実験終了後まで非公開、という既存方針を維持する)。

import type { GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { computeProbability } from "motsuyoku-sensor-core";

export const RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWS = 1000;

export function isTargetResearchEligible(dataset: GemDataset, target: TargetBloodGem): boolean {
  const { approxOneInN } = computeProbability(dataset, target);
  return approxOneInN <= RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWS;
}
