// DrawEngine（仕様書 0節・2節・4節）。ステートレス。researchEligible等のUI用フラグは一切参照しない
// （参照できるフィールドすら渡していない — TargetBloodGemを直接使わない設計にしてある）。

import { InvalidDatasetError, MissingPoolDataError } from "../errors.js";
import { allEntries } from "./effectPool.js";
import { weightedPick } from "./weightedPick.js";
import { createDefaultRng } from "./rng.js";

function pickShape(dataset, rng) {
  return weightedPick(dataset.shapeTable.entries, rng).shapeId;
}

function pickPrimaryEffect(dataset, rng) {
  const pool = dataset.effectPools.primary;
  const entries = allEntries(pool); // pool.__blocked なら MissingPoolDataError を投げる
  return weightedPick(entries, rng).effectId;
}

// rankTiers のうちどれを引くか。distribution が無ければ MissingPoolDataError（BLOCKER #2）。
function pickRankTier(rankTiers, distribution, rng, contextLabel) {
  if (!distribution) {
    throw new MissingPoolDataError(
      `${contextLabel}: rank-tier distribution (rankTiers=${JSON.stringify(rankTiers)} のうちどれがどの確率で出るか) が仕様書上未確定です（BLOCKER #2）。`,
      { rankTiers }
    );
  }
  const entries = rankTiers.map((rank, i) => ({ rank, weight: distribution[i] }));
  return weightedPick(entries, rng).rank;
}

function pickSecondaryEffectExcluding(dataset, primaryEffectId, rng, allowDuplicateSecondary) {
  const pool = dataset.effectPools.secondary;
  if (!pool) {
    throw new InvalidDatasetError(`dataset ${dataset.datasetId}: secondarySlot is "selectable" but effectPools.secondary is missing`);
  }
  const entries = allEntries(pool);
  if (allowDuplicateSecondary) {
    return weightedPick(entries, rng).effectId;
  }
  // primary/secondary排他（4.1節）: rejection samplingで実装。
  // 数学的には closed-form の P(Y|X excluded) = P(Y)/(1-P(X)) と等価であることを
  // probabilityEngine + Monte Carloのテストで別途検証する。
  const maxAttempts = 100000;
  for (let i = 0; i < maxAttempts; i++) {
    const picked = weightedPick(entries, rng).effectId;
    if (picked !== primaryEffectId) return picked;
  }
  throw new Error(`pickSecondaryEffectExcluding: exceeded ${maxAttempts} rejection-sampling attempts (primaryEffectId=${primaryEffectId})`);
}

// 呪いの排他（4.2節）: primary/secondaryのpositiveEffectIdと衝突するcurseを除外する。
export function getEligibleCurses(dataset, primaryEffectId, secondaryEffectId) {
  const excludedCurseIds = dataset.conflictGroups.groups
    .filter((g) => g.positiveEffectId === primaryEffectId || g.positiveEffectId === secondaryEffectId)
    .map((g) => g.negativeCurseId);
  return dataset.cursePool.entries.filter((e) => !excludedCurseIds.includes(e.curseId));
}

function pickCurse(dataset, primaryEffectId, secondaryEffectId, rng) {
  const eligible = getEligibleCurses(dataset, primaryEffectId, secondaryEffectId);
  if (eligible.length === 0) {
    throw new Error("pickCurse: no eligible curses remain after exclusion — unexpected with current CursePool/ConflictGroup data");
  }
  return weightedPick(eligible, rng).curseId;
}

export function drawOne(dataset, options = {}) {
  const rng = options.rng ?? createDefaultRng();
  const enemy = dataset.enemy;
  if (!enemy) throw new InvalidDatasetError(`dataset ${dataset.datasetId} has no "enemy" reference`);

  const shapeId = pickShape(dataset, rng);
  const primaryEffectId = pickPrimaryEffect(dataset, rng);
  const primaryValueRank = pickRankTier(dataset.primaryRankTiers, dataset.rankTierDistribution?.primary, rng, `${dataset.datasetId} primary rank`);

  let secondaryEffectId = null;
  let secondaryValueRank = null;

  if (enemy.secondarySlot === "selectable") {
    secondaryEffectId = pickSecondaryEffectExcluding(dataset, primaryEffectId, rng, enemy.allowDuplicateSecondary);
    secondaryValueRank = pickRankTier(dataset.secondaryRankTiers, dataset.rankTierDistribution?.secondary, rng, `${dataset.datasetId} secondary rank`);
  } else if (enemy.secondarySlot === "fixed") {
    secondaryEffectId = enemy.fixedSecondaryEffectId;
    if (!enemy.allowDuplicateSecondary && secondaryEffectId === primaryEffectId) {
      // 女幽霊は allowDuplicateSecondary: true なのでここには来ない。将来の矛盾したEnemyDefinitionに対する防御。
      throw new InvalidDatasetError(
        `enemy ${enemy.enemyId}: fixedSecondaryEffectId equals the drawn primary effectId but allowDuplicateSecondary is false`
      );
    }
    secondaryValueRank = pickRankTier(dataset.secondaryRankTiers, dataset.rankTierDistribution?.secondary, rng, `${dataset.datasetId} fixedSecondary rank`);
  }
  // "none": secondaryEffectId/secondaryValueRank は null のまま（3デブ）

  const curseId = pickCurse(dataset, primaryEffectId, secondaryEffectId, rng);

  return {
    datasetId: dataset.datasetId,
    shapeId,
    primaryEffectId,
    primaryValueRank,
    secondaryEffectId,
    secondaryValueRank,
    curseId,
  };
}

export function draw(dataset, count = 10, options = {}) {
  const rng = options.rng ?? createDefaultRng();
  const gems = [];
  for (let i = 0; i < count; i++) {
    gems.push(drawOne(dataset, { rng }));
  }
  return gems;
}
