// 研究モードでTargetとして選択できるかどうかの判定。
//
// 方針(2026-09-19確定): 低確率であること自体を理由にTargetを選択不可にしない。
// ProbabilityEngine上で理論確率を正しく計算できるTarget(p > 0)であれば、確率が
// 極端に低くても選択可能にする。以前はexpected_draws<=1,000という上限で足切りしていたが、
// この上限による足切りは撤廃した。
//
// 選択不可のままにするのは、以下のようにProbabilityEngine上そもそも成立しない
// (p = 0 になる)組み合わせのみ:
//   - EffectPoolに存在しない効果ID/呪いIDを指定した場合
//   - primary/secondaryが同一effectIdで、かつallowDuplicateSecondary=falseの場合(排他)
//   - その他、conflictGroups等の排他条件によりp=0となる組み合わせ
// これらは「データ上・排他条件上生成不可能な組み合わせ」であり、確率の大小とは別の
// 「そもそも起こり得ない」という理由で不可とする(従来通り)。
//
// 重要: これはTarget選択UI(研究モードのみ)にかけるfilterであり、DrawEngineの抽選プールや
// ProbabilityEngineの確率計算自体には一切影響しない。Simulator modeにはこの判定を適用しない
// (Simulator modeはもともと確率による制限を持たない)。
//
// 研究モードのTarget設定画面では、この判定結果(選択可否)だけを使い、実際のp/expected_draws
// の数値そのものは参加者へ開示しない(理論確率は実験終了後まで非公開、という既存方針を維持する)。

import type { GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { computeProbability } from "motsuyoku-sensor-core";

export function isTargetResearchEligible(dataset: GemDataset, target: TargetBloodGem): boolean {
  const { p } = computeProbability(dataset, target);
  return p > 0;
}
