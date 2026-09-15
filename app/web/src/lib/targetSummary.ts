import type { TargetBloodGem } from "motsuyoku-sensor-core";
import type { StoredTarget } from "../storage/simulationHistory";
import { effectLabel } from "../i18n/labels";

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

export function summarizeTarget(target: TargetBloodGem): string {
  const parts = [effectLabel(target.primaryEffectId)];
  if (target.secondaryEffectId) parts.push(`2op:${effectLabel(target.secondaryEffectId)}`);
  parts.push(`呪い${target.acceptedCurses.length}種`);
  return parts.join(" / ");
}
