// ============================================================================
// テスト用フィクスチャ（実際のBloodborneデータではない）
// ============================================================================
// pthumeru_standard_primary_pool の個別weightデータが仕様書に存在しない（BLOCKER #1）ため、
// また貞子・3デブのrank-tier分布も未確定（BLOCKER #2）のため、実データでは
// 3体すべての抽選をエンドツーエンドでテストできない。
// このフィクスチャは、実データが揃っている secondary pool / curse pool / shape table /
// conflict group と、ラベル付きの合成 primary pool・合成rank分布を組み合わせ、
// 「DrawEngine/ProbabilityEngineの仕組みそのもの」（排他処理・重複例外・独立ランク抽選・
// 呪い除外・確率計算とMonte Carloの一致）を検証することを目的とする。
// 研究モードのTarget候補には絶対に出さない（researchUseStatus: "disallowed"）。

import { PthumeruShapeTable } from "../../src/data/shapeTable.js";
import { PthumeruStandardCursePool, PthumeruCommonConflictGroups } from "../../src/data/cursePool.js";
import { PthumeruStandardSecondaryPool } from "../../src/data/secondaryPool.js";
import { EnemyDefinitions } from "../../src/data/enemies.js";

export const FAKE_TEST_PRIMARY_POOL = {
  effectPoolId: "FAKE_TEST_primary_pool__NOT_REAL_GAME_DATA",
  researchUseStatus: "disallowed",
  nativeEntries: [
    { effectId: "physical", weight: 10, verificationStatus: "provisional", evidence: ["provisional"] },
    { effectId: "striking_charge", weight: 10, verificationStatus: "provisional", evidence: ["provisional"] },
    { effectId: "poorman_physical", weight: 10, verificationStatus: "provisional", evidence: ["provisional"] },
    { effectId: "radiant_stamina", weight: 10, verificationStatus: "provisional", evidence: ["provisional"] },
  ],
  ooeEntries: [
    { effectId: "beasthunter", weight: 5, verificationStatus: "provisional", evidence: ["provisional"] },
    { effectId: "kinhunter", weight: 5, verificationStatus: "provisional", evidence: ["provisional"] },
  ],
};

const FAKE_PRIMARY_RANK_TIERS = [16, 17, 18];
const FAKE_SECONDARY_RANK_TIERS = [16, 17, 18];
// テスト用に明示的に「一様分布」と仮定した合成値（本番データではない）。
const FAKE_RANK_DISTRIBUTION = [1, 1, 1];

export function buildTestDataset(enemyKey) {
  const enemy = EnemyDefinitions[enemyKey];
  if (!enemy) throw new Error(`unknown enemyKey "${enemyKey}"`);

  const effectPools = { primary: FAKE_TEST_PRIMARY_POOL };
  if (enemy.secondarySlot === "selectable") {
    effectPools.secondary = PthumeruStandardSecondaryPool; // これは実データ（仕様書3.5節）
  }

  return {
    datasetId: `FAKE_TEST_dataset__${enemy.enemyId}`,
    enemyId: enemy.enemyId,
    enemy,
    chaliceProfile: "FAKE_TEST_fixture",
    shapeTable: PthumeruShapeTable, // 実データ（放射:三角:欠損 = 100:1:1）
    effectPools,
    cursePool: PthumeruStandardCursePool, // 実データ
    conflictGroups: PthumeruCommonConflictGroups, // 実データ
    primaryRankTiers: FAKE_PRIMARY_RANK_TIERS,
    secondaryRankTiers: enemy.secondarySlot === "none" ? null : FAKE_SECONDARY_RANK_TIERS,
    rankTierDistribution: {
      primary: FAKE_RANK_DISTRIBUTION,
      secondary: enemy.secondarySlot === "none" ? null : FAKE_RANK_DISTRIBUTION,
    },
    effectValueBindings: [],
    valueSeriesById: {},
    completeness: { probability: "complete", displayValues: "not_started" },
    dataVersion: "FAKE_TEST_fixture_v1",
  };
}
