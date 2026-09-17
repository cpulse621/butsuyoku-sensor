// Google Apps Scriptへ送るペイロードを明示的に組み立てるDTO層。
//
// 背景(指示M節): 以前はresearchHistory.tsのResearchExperimentをそのままJSON.stringifyして
// POSTしていたが、そのtargetフィールドはネストしたオブジェクト({target: {shape: [...], ...}})
// であり、Sheets側のフラットな列名(shape, primary_effect_id, ...)と噛み合わず、
// Target関連の列が軒並み空欄になっていた。ここでは送信直前にtargetをトップレベルの
// フラットなキーへ展開し、Sheetsの列名とそのまま対応させる。
//
// primary_label/primary_allowed_values/secondary_label/secondary_allowed_values/
// accepted_curse_labels は、実験確定時点(useResearchSession.tsのfinalize)で1回だけ
// 計算されrecord.target_label_snapshotとして保存済みのスナップショットをそのまま使う
// (このモジュールの中で現在のdatasetから再導出することはしない)。理由: dataset更新後に
// 古いrecordを再送すると、実験当時とは異なるValueSeriesから表示値を作ってしまう可能性が
// あるため。canonicalな正本は引き続きID/rank(target.*)であり、変更していない。
// 過去の(このsnapshot導入より前の)未送信recordにsnapshotが無い場合でも、
// 現在のdatasetから推測でbackfillはしない(空文字のまま送る)。
//
// リスト値(shape/ranks/curse_ids等)は配列のままJSON送信するとApps Script側の実装次第で
// 扱いが変わってしまうため、既存のCSVエクスポート(storage/researchHistory.ts)と同じ
// セミコロン区切り文字列に統一しておく(Apps Script側が確実に1セルへ書き込める形)。

import type { ResearchExperiment } from "../storage/researchHistory";
import type { TargetLabelSnapshot } from "../lib/targetSummary";

export interface ExperimentSubmissionPayload extends Omit<ResearchExperiment, "target" | "target_label_snapshot"> {
  shape: string;
  primary_effect_id: string;
  primary_label: string;
  primary_allowed_ranks: string;
  primary_allowed_values: string;
  secondary_effect_id: string;
  secondary_label: string;
  secondary_allowed_ranks: string;
  secondary_allowed_values: string;
  accepted_curse_ids: string;
  accepted_curse_labels: string;
}

const EMPTY_SNAPSHOT: TargetLabelSnapshot = {
  primary_label: "",
  primary_allowed_values: "",
  secondary_label: "",
  secondary_allowed_values: "",
  accepted_curse_labels: "",
};

export function buildExperimentSubmissionPayload(experiment: ResearchExperiment): ExperimentSubmissionPayload {
  const { target, target_label_snapshot, ...rest } = experiment;
  // このsnapshot導入より前に保存されたrecordにはtarget_label_snapshotが存在しないため、
  // 現在のdatasetから推測でbackfillせず空文字のまま送る(fail-soft)。
  const snapshot = target_label_snapshot ?? EMPTY_SNAPSHOT;

  return {
    ...rest,
    shape: target.shape.join(";"),
    primary_effect_id: target.primary_effect_id,
    primary_label: snapshot.primary_label,
    primary_allowed_ranks: target.primary_allowed_ranks.join(";"),
    primary_allowed_values: snapshot.primary_allowed_values,
    secondary_effect_id: target.secondary_effect_id ?? "",
    secondary_label: snapshot.secondary_label,
    secondary_allowed_ranks: target.secondary_allowed_ranks?.join(";") ?? "",
    secondary_allowed_values: snapshot.secondary_allowed_values,
    accepted_curse_ids: target.accepted_curse_ids.join(";"),
    accepted_curse_labels: snapshot.accepted_curse_labels,
  };
}
