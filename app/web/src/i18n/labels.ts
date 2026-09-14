// 表示名の日本語マッピングを一元管理する唯一の場所。
//
// 重要な設計方針:
// - Core側のenemyId/effectId/curseId/shapeId等の内部識別子は一切変更しない。
//   これらはCoreのデータ(app/core/src/data/*)とTarget/BloodGemの照合キーとして
//   そのまま使い続ける。ここで行うのは「表示のときだけ」日本語ラベルに差し替える処理。
// - 未知のIDが来た場合はクラッシュせず、ID自体(を見やすく整形したもの)へfallbackする。
//   これにより、将来Coreにeffect/curseが追加されてもUIが壊れない。

import { humanizeId } from "../lib/format";

// 辞書に無いIDの整形は lib/format.ts の humanizeId(アンダースコア→スペース) に一本化する。
const fallbackLabel = humanizeId;

const ENEMY_LABELS: Record<string, string> = {
  merciless_watchers: "3デブ",
  labyrinth_madman: "貞子",
  evil_labyrinth_spirit: "女幽霊",
};

const SHAPE_LABELS: Record<string, string> = {
  radial: "放射",
  triangle: "三角",
  waning: "欠損",
};

// Primary/共通Effect + Secondary固有Effect をまとめた1つの辞書。
// 「Primaryと同じeffectIdは同じ日本語名を使用」という指示どおり、
// slotに関わらずeffectId単位で1つのラベルを持つ。
const EFFECT_LABELS: Record<string, string> = {
  // Primary / 共通
  physical: "物理攻撃力UP",
  adept_blunt: "重打攻撃力UP",
  adept_thrust: "刺突攻撃力UP",
  striking_charge: "溜め攻撃力UP",
  heavy_str_scaling: "筋力補正UP",
  sharp_skl_scaling: "技術補正UP",
  radiant_stamina: "スタミナ消費軽減",
  poorman_physical: "HP瀕死時 物理UP",
  fools_physical: "HP最大時 物理UP",
  fire: "炎攻撃力UP",
  arcane: "神秘攻撃力UP",
  bolt: "雷光攻撃力UP",
  dirty_rapid_poison: "劇毒加算",
  murky_slow_poison: "遅効毒加算",
  pulsing_hp_regen: "HP自動回復",
  beasthunter: "対獣攻撃力UP",
  kinhunter: "対眷属攻撃力UP",
  cold_arc_scaling: "神秘補正UP",
  fools_all: "HP最大時 全攻撃力UP",
  nourishing: "全攻撃力UP",
  blood: "血の攻撃力UP",
  warm_blt_scaling: "血質補正UP",
  poorman_all: "HP瀕死時 全攻撃力UP",

  // Secondary固有
  odd_physical: "物理攻撃力加算",
  dense_durability: "武器耐久度UP",
  open_foes: "隙をついた攻撃力UP",
  rally_potential: "リゲイン量UP",
  odd_fire: "炎攻撃力加算",
  odd_bolt: "雷光攻撃力加算",
  odd_arcane: "神秘攻撃力加算",
  odd_blood: "血の攻撃力加算",
};

const CURSE_LABELS: Record<string, string> = {
  stamina_cost_up: "スタミナ消費増加",
  kin_attack_down: "対眷属攻撃力低下",
  beast_attack_down: "対獣攻撃力低下",
  durability_down: "耐久度低下",
  hp_deplete: "HP減少",
  attack_down: "全攻撃力低下",
};

export function enemyLabel(enemyId: string): string {
  return ENEMY_LABELS[enemyId] ?? fallbackLabel(enemyId);
}

export function shapeLabel(shapeId: string): string {
  return SHAPE_LABELS[shapeId] ?? fallbackLabel(shapeId);
}

export function effectLabel(effectId: string): string {
  return EFFECT_LABELS[effectId] ?? fallbackLabel(effectId);
}

export function curseLabel(curseId: string): string {
  return CURSE_LABELS[curseId] ?? fallbackLabel(curseId);
}

export function matchStatusLabel(matched: boolean | null): string {
  if (matched === null) return "Target未設定";
  return matched ? "条件一致" : "条件外";
}
