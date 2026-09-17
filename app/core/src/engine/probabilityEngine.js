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

// 「実際に抽選で出た1個のBloodGemそのものが出る確率」を計算する。
// 新しい確率モデルは一切追加しない: そのgemの各フィールドを単一値のTargetBloodGemへ
// 変換し、既存のcomputeProbability()にそのまま渡すだけ（排他・再正規化ロジックの再実装をしない）。
// コインコストのような「レア度に応じた値」の算出根拠として使う想定（コスト式自体はここでは扱わない）。
export function computeGemProbability(dataset, gem) {
  const target = {
    datasetId: gem.datasetId,
    acceptedShapes: [gem.shapeId],
    primaryEffectId: gem.primaryEffectId,
    acceptedPrimaryRanks: [gem.primaryValueRank],
    acceptedCurses: [gem.curseId],
  };
  if (gem.secondaryEffectId !== null && gem.secondaryEffectId !== undefined) {
    target.secondaryEffectId = gem.secondaryEffectId;
    target.acceptedSecondaryRanks = [gem.secondaryValueRank];
  }
  return computeProbability(dataset, target);
}

// datasetが生成しうる全canonical組み合わせ(BloodGemの形)とその正確な確率pを列挙する。
// 抽選ロジックの再実装ではない: 各プールのエントリ・rankTiers・secondarySlotの分岐を
// そのまま組み合わせて全パターンを作り、それぞれをcomputeGemProbability()に渡すだけ。
// p=0の組み合わせ(排他で成立しないもの)は除外する。用途: コインコスト式の比較検討・
// dataset全体のエントロピー計算(computeDatasetEntropyBits)。新しい確率モデルではない。
export function enumerateGemProbabilities(dataset) {
  const shapeIds = dataset.shapeTable.entries.map((e) => e.shapeId);
  const primaryEntries = allEntries(dataset.effectPools.primary);
  const curseIds = dataset.cursePool.entries.map((e) => e.curseId);
  const enemy = dataset.enemy;

  const results = [];
  for (const shapeId of shapeIds) {
    for (const primaryEntry of primaryEntries) {
      for (const primaryValueRank of dataset.primaryRankTiers) {
        const secondaryCombos = [];
        if (enemy.secondarySlot === "selectable") {
          const secondaryEntries = allEntries(dataset.effectPools.secondary);
          for (const secondaryEntry of secondaryEntries) {
            for (const secondaryValueRank of dataset.secondaryRankTiers) {
              secondaryCombos.push({ secondaryEffectId: secondaryEntry.effectId, secondaryValueRank });
            }
          }
        } else if (enemy.secondarySlot === "fixed") {
          for (const secondaryValueRank of dataset.secondaryRankTiers) {
            secondaryCombos.push({ secondaryEffectId: enemy.fixedSecondaryEffectId, secondaryValueRank });
          }
        } else {
          secondaryCombos.push({ secondaryEffectId: null, secondaryValueRank: null });
        }
        for (const secondary of secondaryCombos) {
          for (const curseId of curseIds) {
            const gem = {
              datasetId: dataset.datasetId,
              shapeId,
              primaryEffectId: primaryEntry.effectId,
              primaryValueRank,
              secondaryEffectId: secondary.secondaryEffectId,
              secondaryValueRank: secondary.secondaryValueRank,
              curseId,
            };
            const { p } = computeGemProbability(dataset, gem);
            if (p > 0) results.push({ gem, p });
          }
        }
      }
    }
  }
  return results;
}

// dataset全体のShannon entropy(bits/draw): H = E[-log2(p)] = sum(p * -log2(p))。
// コインコスト式D(dataset-normalized surprisal)の分母として使う想定。
export function computeDatasetEntropyBits(dataset) {
  return enumerateGemProbabilities(dataset).reduce((sum, { p }) => sum - p * Math.log2(p), 0);
}
