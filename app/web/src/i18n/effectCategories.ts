// Target設定でのeffect探索を高速化するためのカテゴリ分け。
// 表示専用の分類であり、Core側のeffectId・確率データには一切影響しない。
// 未分類のeffectId(将来Coreに追加された場合等)は「その他」へ自動的に入る(クラッシュしない)。

export interface EffectCategory {
  name: string;
  effectIds: string[];
}

export const EFFECT_CATEGORIES: EffectCategory[] = [
  { name: "物理系", effectIds: ["physical", "adept_blunt", "adept_thrust", "striking_charge", "odd_physical"] },
  { name: "条件付き強化", effectIds: ["fools_physical", "poorman_physical", "fools_all", "poorman_all"] },
  { name: "能力補正", effectIds: ["heavy_str_scaling", "sharp_skl_scaling", "warm_blt_scaling", "cold_arc_scaling"] },
  { name: "属性", effectIds: ["fire", "arcane", "bolt", "blood", "odd_fire", "odd_bolt", "odd_arcane", "odd_blood"] },
  { name: "対種族", effectIds: ["beasthunter", "kinhunter"] },
  { name: "状態異常 / 回復", effectIds: ["dirty_rapid_poison", "murky_slow_poison", "pulsing_hp_regen", "rally_potential"] },
  { name: "その他", effectIds: ["nourishing", "radiant_stamina", "dense_durability", "open_foes"] },
];

const CATEGORY_BY_EFFECT_ID: Record<string, string> = Object.fromEntries(
  EFFECT_CATEGORIES.flatMap((cat) => cat.effectIds.map((id) => [id, cat.name]))
);

const FALLBACK_CATEGORY = "その他";

export function categoryForEffect(effectId: string): string {
  return CATEGORY_BY_EFFECT_ID[effectId] ?? FALLBACK_CATEGORY;
}

// 与えられたeffectId集合を、EFFECT_CATEGORIESの順序でグループ化する。
// 未分類のIDは末尾の「その他」枠へ追加される(「その他」自体が定義済みなら合流する)。
export function groupEffectIdsByCategory(effectIds: string[]): { name: string; effectIds: string[] }[] {
  const present = new Set(effectIds);
  const groups: { name: string; effectIds: string[] }[] = EFFECT_CATEGORIES.map((cat) => ({
    name: cat.name,
    effectIds: cat.effectIds.filter((id) => present.has(id)),
  }));

  const categorized = new Set(EFFECT_CATEGORIES.flatMap((c) => c.effectIds));
  const uncategorized = effectIds.filter((id) => !categorized.has(id));
  if (uncategorized.length > 0) {
    const other = groups.find((g) => g.name === FALLBACK_CATEGORY);
    if (other) {
      other.effectIds = [...other.effectIds, ...uncategorized];
    } else {
      groups.push({ name: FALLBACK_CATEGORY, effectIds: uncategorized });
    }
  }

  return groups.filter((g) => g.effectIds.length > 0);
}
