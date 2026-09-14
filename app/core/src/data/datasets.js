// GemDataset registry。仕様書 1.1節 / 5.1節 / 5.2節 / 5.3節を配線する。
//
// rankTierDistribution について（BLOCKER #2 は解消済み）:
// 2026-09-14、ユーザーより以下のRank tier分布の指定を受けた:
//   - Merciless Watchers (3デブ): R17=1/3, R18=1/3, R19=1/3
//   - Red Aura Labyrinth Madman (貞子): R16=1/3, R17=1/3, R18=1/3
//     （Primary/Secondaryそれぞれ独立に1/3抽選。primaryValueRankとsecondaryValueRankを
//       同一乱数・同一Rankに連動させないこと、と明示的に指示されている）
//   - 女幽霊: R15/R16/R17 各1/3（v0.12で既に確定済み、変更なし）
// DrawEngine（drawEngine.js）はもともとprimaryValueRank/secondaryValueRankを
// 常に別々の pickRankTier() 呼び出し（別々の rng.next() 消費）で独立抽選しており、
// 今回のデータ追加によって挙動を変える必要はない（依然として独立抽選のまま）。

import { InvalidDatasetError } from "../errors.js";
import { PthumeruShapeTable } from "./shapeTable.js";
import { PthumeruStandardCursePool, PthumeruCommonConflictGroups } from "./cursePool.js";
import { PthumeruStandardPrimaryPool } from "./primaryPool.js";
import { PthumeruStandardSecondaryPool } from "./secondaryPool.js";
import { EnemyDefinitions } from "./enemies.js";
import { WatchersPrimaryRankTiers, WatchersEffectValueBindings, WatchersValueSeriesById } from "./valueSeries/watchers.js";
import { MadmanPrimaryRankTiers, MadmanSecondaryRankTiers, MadmanEffectValueBindings, MadmanValueSeriesById } from "./valueSeries/madman.js";
import { EvilSpiritPrimaryRankTiers, EvilSpiritSecondaryRankTiers, EvilSpiritEffectValueBindings, EvilSpiritValueSeriesById } from "./valueSeries/evilSpirit.js";

export const WatchersDataset = {
  datasetId: "pthumeru_depth5_standard_watchers_v0_1",
  enemyId: EnemyDefinitions.watchers.enemyId,
  enemy: EnemyDefinitions.watchers,
  chaliceProfile: "pthumeru_ihyll_depth5_standard",
  shapeTable: PthumeruShapeTable,
  effectPools: { primary: PthumeruStandardPrimaryPool },
  cursePool: PthumeruStandardCursePool,
  conflictGroups: PthumeruCommonConflictGroups,
  primaryRankTiers: WatchersPrimaryRankTiers,
  secondaryRankTiers: null,
  rankTierDistribution: { primary: [1, 1, 1], secondary: null }, // R17/R18/R19 各1/3（確定）。3デブはsecondaryRankTiers自体が無いためsecondaryはnullのまま。
  effectValueBindings: WatchersEffectValueBindings,
  valueSeriesById: WatchersValueSeriesById,
  completeness: { probability: "complete", displayValues: "partial" },
  dataVersion: "v0.12-watchers",
};

export const MadmanDataset = {
  datasetId: "pthumeru_depth5_red_aura_madman_v0_1",
  enemyId: EnemyDefinitions.madman.enemyId,
  enemy: EnemyDefinitions.madman,
  chaliceProfile: "pthumeru_ihyll_depth5_standard",
  shapeTable: PthumeruShapeTable,
  effectPools: { primary: PthumeruStandardPrimaryPool, secondary: PthumeruStandardSecondaryPool },
  cursePool: PthumeruStandardCursePool,
  conflictGroups: PthumeruCommonConflictGroups,
  primaryRankTiers: MadmanPrimaryRankTiers,
  secondaryRankTiers: MadmanSecondaryRankTiers,
  rankTierDistribution: { primary: [1, 1, 1], secondary: [1, 1, 1] }, // R16/R17/R18 各1/3、Primary/Secondaryそれぞれ独立に確定
  effectValueBindings: MadmanEffectValueBindings,
  valueSeriesById: MadmanValueSeriesById,
  completeness: { probability: "complete", displayValues: "partial" },
  dataVersion: "v0.11-primary7-secondary9-full-confirmed",
};

export const EvilSpiritDataset = {
  datasetId: "pthumeru_depth5_standard_evil_spirit_v0_1",
  enemyId: EnemyDefinitions.evilSpirit.enemyId,
  enemy: EnemyDefinitions.evilSpirit,
  chaliceProfile: "pthumeru_ihyll_depth5_standard",
  shapeTable: PthumeruShapeTable,
  effectPools: { primary: PthumeruStandardPrimaryPool },
  cursePool: PthumeruStandardCursePool,
  conflictGroups: PthumeruCommonConflictGroups,
  primaryRankTiers: EvilSpiritPrimaryRankTiers,
  secondaryRankTiers: EvilSpiritSecondaryRankTiers,
  rankTierDistribution: { primary: [1, 1, 1], secondary: [1, 1, 1] }, // v0.12: 各1/3（確定）
  effectValueBindings: EvilSpiritEffectValueBindings,
  valueSeriesById: EvilSpiritValueSeriesById,
  completeness: { probability: "complete", displayValues: "partial" },
  dataVersion: "v0.12-skeleton-r17-confirmed",
};

export const GemDatasets = {
  [WatchersDataset.datasetId]: WatchersDataset,
  [MadmanDataset.datasetId]: MadmanDataset,
  [EvilSpiritDataset.datasetId]: EvilSpiritDataset,
};

export function getDataset(datasetId) {
  const ds = GemDatasets[datasetId];
  if (!ds) throw new InvalidDatasetError(`unknown datasetId: ${datasetId}`);
  return ds;
}

export function getEnemyDefinition(enemyId) {
  const found = Object.values(EnemyDefinitions).find((e) => e.enemyId === enemyId);
  if (!found) throw new InvalidDatasetError(`unknown enemyId: ${enemyId}`);
  return found;
}

// slot: "primary" | "secondary", rank: number
// バインディング/ValueSeriesが無い場合は verificationStatus: "unknown" を返す（例外にしない。
// 「値が未確定でも抽選自体は行う」という仕様書の原則に合わせ、表示値の欠落は通常の状態として扱う）。
export function lookupDisplayValue(dataset, slot, effectId, rank) {
  const binding = dataset.effectValueBindings.find((b) => b.slot === slot && b.effectId === effectId);
  if (!binding) return { value: null, verificationStatus: "unknown", evidence: [] };
  const series = dataset.valueSeriesById[binding.valueSeriesId];
  const entry = series?.valuesByRank?.[rank];
  if (!entry) return { value: null, verificationStatus: "unknown", evidence: [] };
  return { value: entry.value, verificationStatus: entry.verificationStatus, evidence: entry.evidence ?? [], unit: binding.unit, displayFormat: binding.displayFormat };
}
