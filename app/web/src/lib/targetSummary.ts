import type { GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { lookupDisplayValue } from "motsuyoku-sensor-core";
import type { StoredTarget } from "../storage/simulationHistory";
import { effectLabel, curseLabel } from "../i18n/labels";

// シミュレーターモード・研究モード共通で使う、TargetBloodGem→永続化用の平坦なデータ形状への変換。
export function toStoredTarget(target: TargetBloodGem): StoredTarget {
  return {
    shape: target.acceptedShapes,
    primary_effect_id: target.primaryEffectId,
    primary_allowed_ranks: target.acceptedPrimaryRanks,
    secondary_effect_id: target.secondaryEffectId ?? null,
    secondary_allowed_ranks: target.acceptedSecondaryRanks ?? null,
    accepted_curse_ids: target.acceptedCurses,
  };
}

export function storedTargetToTarget(datasetId: string, stored: StoredTarget): TargetBloodGem {
  const target: TargetBloodGem = {
    datasetId,
    acceptedShapes: stored.shape,
    primaryEffectId: stored.primary_effect_id,
    acceptedPrimaryRanks: stored.primary_allowed_ranks,
    acceptedCurses: stored.accepted_curse_ids,
  };
  if (stored.secondary_effect_id) target.secondaryEffectId = stored.secondary_effect_id;
  if (stored.secondary_allowed_ranks) target.acceptedSecondaryRanks = stored.secondary_allowed_ranks;
  return target;
}

export interface TargetDraftSetters {
  setAllShapes: (shapeIds: string[]) => void;
  setPrimaryEffect: (effectId: string | null) => void;
  setSecondaryEffect: (effectId: string | null) => void;
  setAllCurses: (curseIds: string[]) => void;
}

// 「最近使ったTarget」適用用。既存のuseTargetDraftのsetterへ一括で反映する。
// ランクは既存のuseTargetDraft側のeffect(effect変更時にカタログから既定値を再計算する処理)に
// 委ね、ここでは効果・呪いの選択のみを復元する(カタログが変わっていた場合も安全なため)。
export function applyStoredTargetViaSetters(stored: StoredTarget, setters: TargetDraftSetters): void {
  setters.setAllShapes(stored.shape);
  setters.setPrimaryEffect(stored.primary_effect_id);
  if (stored.secondary_effect_id) setters.setSecondaryEffect(stored.secondary_effect_id);
  setters.setAllCurses(stored.accepted_curse_ids);
}

// 送信DTO(services/submissionDto.ts)がSheetsへ送るTarget表示情報のスナップショット型。
// canonicalな正本はあくまでID/rank(target/StoredTarget)であり、これは表示用の派生値。
// 実験確定時点(finalize)の1回だけ計算してResearchExperimentへ保存し、後日(dataset更新後に)
// 再送しても、実験当時の表示内容が変わらないようにする(指示: dataset更新後の再送で
// 表示値が変化してしまう問題への対応)。
export interface TargetLabelSnapshot {
  primary_label: string;
  primary_allowed_values: string;
  secondary_label: string;
  secondary_allowed_values: string;
  accepted_curse_labels: string;
}

function ranksToValueList(dataset: GemDataset, slot: "primary" | "secondary", effectId: string, ranks: number[]): string {
  return ranks
    .map((rank) => {
      const info = lookupDisplayValue(dataset, slot, effectId, rank);
      return info.value === null ? "" : String(info.value);
    })
    .join(";");
}

// 実験開始/確定時点のdataset(=そのCoreセッションが使っていたdataset、実験中に変わらない)から
// 表示情報を導出する。この関数の呼び出しタイミング(finalize時)自体が「snapshot」の実体であり、
// 後から呼び直すことは想定していない(呼び直すと別のsnapshotになってしまうため)。
export function buildTargetLabelSnapshot(dataset: GemDataset, target: TargetBloodGem): TargetLabelSnapshot {
  const secondaryEffectId = target.secondaryEffectId ?? null;
  return {
    primary_label: effectLabel(target.primaryEffectId),
    primary_allowed_values: ranksToValueList(dataset, "primary", target.primaryEffectId, target.acceptedPrimaryRanks),
    secondary_label: secondaryEffectId ? effectLabel(secondaryEffectId) : "",
    secondary_allowed_values: secondaryEffectId ? ranksToValueList(dataset, "secondary", secondaryEffectId, target.acceptedSecondaryRanks ?? []) : "",
    accepted_curse_labels: target.acceptedCurses.map(curseLabel).join(";"),
  };
}

export function summarizeTarget(target: TargetBloodGem): string {
  const parts = [effectLabel(target.primaryEffectId)];
  if (target.secondaryEffectId) parts.push(`2op:${effectLabel(target.secondaryEffectId)}`);
  parts.push(`呪い${target.acceptedCurses.length}種`);
  return parts.join(" / ");
}
