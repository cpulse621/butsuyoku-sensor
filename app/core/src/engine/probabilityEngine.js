// ProbabilityEngine（仕様書 4.1節・4.2節・7節）。
// p / 約1/N / ProbabilityBreakdown（各ステージのraw vs. 排他後の実効値）を計算する。
// getEligibleCurses は drawEngine.js の実装をそのまま共有し、抽選側と確率計算側で
// 排他ロジックが乖離しないようにする。

import { InvalidTargetError, MissingPoolDataError } from "../errors.js";
import { allEntries } from "./effectPool.js";
import { effectiveWeight, totalWeight } from "./weightedPick.js";
import { getEligibleCurses } from "./drawEngine.js";

function poolRawProbabilityOf(pool, effectId) {
  const entries = allEntries(pool); // __blocked なら MissingPoolDataError
  const total = totalWeight(entries);
  const entry = entries.find((e) => e.effectId === effectId);
  return entry ? effectiveWeight(entry) / total : 0;
}

function rankTierProbability(rankTiers, distribution, acceptedRanks, contextLabel) {
  if (!distribution) {
    throw new MissingPoolDataError(
      `${contextLabel}: rank-tier distribution (rankTiers=${JSON.stringify(rankTiers)}) が仕様書上未確定です（BLOCKER #2）。`,
      { rankTiers }
    );
  }
  const total = distribution.reduce((s, w) => s + w, 0);
  let sum = 0;
  rankTiers.forEach((rank, i) => {
    if (acceptedRanks.includes(rank)) sum += distribution[i];
  });
  return sum / total;
}

export function validateTarget(dataset, target) {
  if (target.datasetId !== dataset.datasetId) {
    throw new InvalidTargetError(`target.datasetId (${target.datasetId}) does not match dataset.datasetId (${dataset.datasetId})`);
  }
  const enemy = dataset.enemy;
  if (!Array.isArray(target.acceptedShapes) || target.acceptedShapes.length === 0) {
    throw new InvalidTargetError("target.acceptedShapes must be a non-empty array");
  }
  if (!target.primaryEffectId) {
    throw new InvalidTargetError("target.primaryEffectId is required");
  }
  if (!Array.isArray(target.acceptedPrimaryRanks) || target.acceptedPrimaryRanks.length === 0) {
    throw new InvalidTargetError("target.acceptedPrimaryRanks must be a non-empty array");
  }
  if (!Array.isArray(target.acceptedCurses) || target.acceptedCurses.length === 0) {
    throw new InvalidTargetError("target.acceptedCurses must be a non-empty array");
  }
  if (enemy.secondarySlot === "none" && (target.secondaryEffectId || target.acceptedSecondaryRanks)) {
    throw new InvalidTargetError(`enemy ${enemy.enemyId} has secondarySlot "none" but target specifies a secondary constraint`);
  }
  if (enemy.secondarySlot === "selectable") {
    const hasEffect = !!target.secondaryEffectId;
    const hasRanks = Array.isArray(target.acceptedSecondaryRanks) && target.acceptedSecondaryRanks.length > 0;
    if (hasEffect !== hasRanks) {
      throw new InvalidTargetError(
        `enemy ${enemy.enemyId}: target.secondaryEffectId と target.acceptedSecondaryRanks は両方指定するか両方省略する必要があります`
      );
    }
  }
  if (enemy.secondarySlot === "fixed" && target.secondaryEffectId && target.secondaryEffectId !== enemy.fixedSecondaryEffectId) {
    throw new InvalidTargetError(
      `enemy ${enemy.enemyId}: secondary is fixed to "${enemy.fixedSecondaryEffectId}", target requested "${target.secondaryEffectId}"`
    );
  }
}

export function computeProbability(dataset, target) {
  validateTarget(dataset, target);
  const enemy = dataset.enemy;

  // --- shape ---
  const shapeEntries = dataset.shapeTable.entries;
  const shapeTotal = totalWeight(shapeEntries);
  const shapeProb =
    shapeEntries.filter((e) => target.acceptedShapes.includes(e.shapeId)).reduce((s, e) => s + effectiveWeight(e), 0) / shapeTotal;

  // --- primary effect + rank ---
  const primaryPool = dataset.effectPools.primary;
  const primaryEffectProb = poolRawProbabilityOf(primaryPool, target.primaryEffectId);
  const primaryRankProb = rankTierProbability(
    dataset.primaryRankTiers,
    dataset.rankTierDistribution?.primary,
    target.acceptedPrimaryRanks,
    `${dataset.datasetId} primary rank`
  );

  // --- secondary effect (raw vs. 排他後effective) + rank ---
  let secondaryEffectRaw = 1;
  let secondaryEffectEffective = 1;
  let secondaryRankProb = 1;

  if (enemy.secondarySlot === "selectable" && target.secondaryEffectId) {
    const secondaryPool = dataset.effectPools.secondary;
    secondaryEffectRaw = poolRawProbabilityOf(secondaryPool, target.secondaryEffectId);
    if (target.secondaryEffectId === target.primaryEffectId && !enemy.allowDuplicateSecondary) {
      // 4.1節: P(secondaryEffect = Y | primaryEffect = X) = 0 if Y == X and not allowDuplicateSecondary
      secondaryEffectEffective = 0;
    } else {
      // 4.1節: P(Y | X excluded) = P(Y) / (1 - P(X))
      const primaryRawInSecondaryPool = poolRawProbabilityOf(secondaryPool, target.primaryEffectId);
      const denom = 1 - primaryRawInSecondaryPool;
      secondaryEffectEffective = denom > 0 ? secondaryEffectRaw / denom : 0;
    }
    secondaryRankProb = rankTierProbability(
      dataset.secondaryRankTiers,
      dataset.rankTierDistribution?.secondary,
      target.acceptedSecondaryRanks ?? [],
      `${dataset.datasetId} secondary rank`
    );
  } else if (enemy.secondarySlot === "fixed") {
    // P(fixedSecondary = fixedSecondaryEffectId) = 1（種類抽選が存在しないため）
    secondaryEffectRaw = 1;
    secondaryEffectEffective = 1;
    const acceptedRanks = target.acceptedSecondaryRanks ?? dataset.secondaryRankTiers; // 未指定なら「rankは問わない」
    secondaryRankProb = rankTierProbability(
      dataset.secondaryRankTiers,
      dataset.rankTierDistribution?.secondary,
      acceptedRanks,
      `${dataset.datasetId} fixedSecondary rank`
    );
  }
  // "none": raw/effective/rankProb はすべて1のまま（secondary要因なし）

  // --- curse（4.2節: 排他後に再正規化） ---
  const secondaryEffectIdForCurses = enemy.secondarySlot === "fixed" ? enemy.fixedSecondaryEffectId : target.secondaryEffectId;
  const eligibleCurses = getEligibleCurses(dataset, target.primaryEffectId, secondaryEffectIdForCurses);
  const eligibleTotal = totalWeight(eligibleCurses);
  const curseEffective =
    eligibleCurses.filter((e) => target.acceptedCurses.includes(e.curseId)).reduce((s, e) => s + effectiveWeight(e), 0) / eligibleTotal;
  const cursePoolTotal = totalWeight(dataset.cursePool.entries);
  const curseRaw =
    dataset.cursePool.entries.filter((e) => target.acceptedCurses.includes(e.curseId)).reduce((s, e) => s + effectiveWeight(e), 0) /
    cursePoolTotal;

  const p = shapeProb * primaryEffectProb * primaryRankProb * secondaryEffectEffective * secondaryRankProb * curseEffective;

  const breakdown = {
    shape: { raw: shapeProb, effective: shapeProb },
    primaryEffect: { raw: primaryEffectProb, effective: primaryEffectProb },
    primaryRank: { raw: primaryRankProb, effective: primaryRankProb },
    secondaryEffect: { raw: secondaryEffectRaw, effective: secondaryEffectEffective },
    secondaryRank: { raw: secondaryRankProb, effective: secondaryRankProb },
    curse: { raw: curseRaw, effective: curseEffective },
  };

  return {
    p,
    approxOneInN: p > 0 ? 1 / p : Infinity,
    breakdown,
  };
}
