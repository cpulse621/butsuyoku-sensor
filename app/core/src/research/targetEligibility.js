// 研究モードのTarget選択可否（仕様書 7.1節: プールレベル×値レベルの独立した2ゲート）。
// researchEligible（6節、UX用フラグ）はここでは一切扱わない。

import { allEntries } from "../engine/effectPool.js";

// プールレベルのゲート: そのEffectPool自体が研究Targetの母集団として提示可能か。
// __blocked なプール（BLOCKER #1: primary pool）は、そもそも重みが無く実際に抽選できないため、
// 個々のeffectIdの実在は分かっていても Target候補としては一切提示しない（[]を返す）。
export function getEligibleTargetEffects(pool) {
  if (!pool || pool.__blocked) return [];
  if (pool.researchUseStatus === "disallowed") return [];
  return allEntries(pool).map((e) => e.effectId);
}

// 値レベルのゲート: そのeffectIdの「具体的な数値」のうち confirmed なrankのみを返す。
export function getEligibleTargetValues(dataset, slot, effectId) {
  const binding = dataset.effectValueBindings.find((b) => b.slot === slot && b.effectId === effectId);
  if (!binding) return [];
  const series = dataset.valueSeriesById[binding.valueSeriesId];
  if (!series) return [];
  return Object.entries(series.valuesByRank)
    .filter(([, entry]) => entry.verificationStatus === "confirmed")
    .map(([rank, entry]) => ({ rank: Number(rank), value: entry.value, evidence: entry.evidence ?? [] }));
}

// 研究モードでTargetとして提示してよい候補一覧。
// exactValueSelectable: false の項目は「effectId一致のみ（数値は問わない）」粒度でのみ選択可能
// （7.1節の適用例: 貞子secondary "odd_physical" のような、プールは許可済みだが値が未確定のケース）。
//
// secondarySlot: "fixed"（女幽霊）の場合、種類抽選そのものが存在しないため
// EffectPool.researchUseStatus による判定は行わず、固定effectIdを単独候補として返す。
export function getResearchTargetCatalog(dataset, slot) {
  const enemy = dataset.enemy;

  if (slot === "secondary" && enemy.secondarySlot === "none") return [];

  if (slot === "secondary" && enemy.secondarySlot === "fixed") {
    const effectId = enemy.fixedSecondaryEffectId;
    const confirmedRanks = getEligibleTargetValues(dataset, "secondary", effectId);
    return [
      {
        effectId,
        poolLevelGate: "not_applicable_fixed_slot",
        exactValueSelectable: confirmedRanks.length > 0,
        confirmedRanks,
      },
    ];
  }

  const pool = slot === "primary" ? dataset.effectPools.primary : dataset.effectPools.secondary;
  if (!pool) return [];

  const eligibleEffectIds = getEligibleTargetEffects(pool);
  return eligibleEffectIds.map((effectId) => {
    const confirmedRanks = getEligibleTargetValues(dataset, slot, effectId);
    return {
      effectId,
      poolLevelGate: pool.researchUseStatus,
      exactValueSelectable: confirmedRanks.length > 0,
      confirmedRanks,
    };
  });
}
