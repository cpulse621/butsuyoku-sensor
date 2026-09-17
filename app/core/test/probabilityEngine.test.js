import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, drawOne, getEligibleCurses } from "../src/engine/drawEngine.js";
import { computeProbability, computeGemProbability, enumerateGemProbabilities, computeDatasetEntropyBits } from "../src/engine/probabilityEngine.js";
import { isMatch } from "../src/engine/targetMatcher.js";
import { createSeededRng } from "../src/engine/rng.js";
import { totalWeight, effectiveWeight } from "../src/engine/weightedPick.js";
import { PthumeruStandardSecondaryPool } from "../src/data/secondaryPool.js";
import { buildTestDataset } from "./fixtures/testDataset.js";
import { EvilSpiritDataset, WatchersDataset, MadmanDataset } from "../src/data/datasets.js";

// 正規近似での許容誤差チェック。sigma=6は偶発的なテスト失敗(flaky)を避けるためやや広め。
function assertMatchesMonteCarlo(observedCount, n, p, label) {
  const expected = n * p;
  const std = Math.sqrt(n * p * (1 - p));
  const slack = Math.max(6 * std, 3);
  assert.ok(
    Math.abs(observedCount - expected) <= slack,
    `${label}: observed=${observedCount}, expected≈${expected.toFixed(2)} (p=${p}), slack=±${slack.toFixed(2)}`
  );
}

test("ProbabilityEngine × Monte Carlo: 貞子(madman)のTarget確率が実測頻度と一致する", () => {
  const dataset = buildTestDataset("madman");
  const target = {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [18],
    secondaryEffectId: "striking_charge",
    acceptedSecondaryRanks: [17, 18],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 3,
    researchEligible: true,
  };
  const { p } = computeProbability(dataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 200000;
  const rng = createSeededRng(20260914);
  const gems = draw(dataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "madman target");
});

test("ProbabilityEngine × Monte Carlo: 3デブ(watchers, secondaryなし)のTarget確率が実測頻度と一致する", () => {
  const dataset = buildTestDataset("watchers");
  const target = {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [17],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete"],
    desireScore: 5,
    researchEligible: true,
  };
  const { p } = computeProbability(dataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 100000;
  const rng = createSeededRng(555555);
  const gems = draw(dataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "watchers target");
});

test("ProbabilityEngine × Monte Carlo: 女幽霊(evilSpirit, fixed secondary)のTarget確率が実測頻度と一致する", () => {
  const dataset = buildTestDataset("evilSpirit");
  const target = {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "poorman_physical",
    acceptedPrimaryRanks: [16, 17],
    acceptedSecondaryRanks: [17],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 4,
    researchEligible: true,
  };
  const { p } = computeProbability(dataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 100000;
  const rng = createSeededRng(9001);
  const gems = draw(dataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "evilSpirit target");
});

test("排他: primary==secondaryかつallowDuplicateSecondary=falseならp=0(貞子)", () => {
  const dataset = buildTestDataset("madman");
  const target = {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial", "triangle", "waning"],
    primaryEffectId: "striking_charge",
    acceptedPrimaryRanks: [16, 17, 18],
    secondaryEffectId: "striking_charge",
    acceptedSecondaryRanks: [16, 17, 18],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 1,
    researchEligible: true,
  };
  const { p, breakdown } = computeProbability(dataset, target);
  assert.equal(p, 0);
  assert.equal(breakdown.secondaryEffect.effective, 0);

  // DrawEngine側でも実際にこの組み合わせが一度も生成されないことを確認
  const rng = createSeededRng(314159);
  const gems = draw(dataset, 20000, { rng });
  const violating = gems.filter((g) => g.primaryEffectId === "striking_charge" && g.secondaryEffectId === "striking_charge");
  assert.equal(violating.length, 0);
});

test("排他の再正規化式: P(Y|X excluded) = P(Y)/(1-P(X)) が実データと一致する(貞子secondary)", () => {
  const dataset = buildTestDataset("madman");
  const target = {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial", "triangle", "waning"],
    primaryEffectId: "striking_charge",
    acceptedPrimaryRanks: [16, 17, 18],
    secondaryEffectId: "poorman_physical",
    acceptedSecondaryRanks: [16, 17, 18],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 1,
    researchEligible: true,
  };
  const { breakdown } = computeProbability(dataset, target);

  // 仕様書4.1節の式をテスト側でも独立に(secondaryPoolの生データから)再計算し、一致することを確認する。
  const entries = [...PthumeruStandardSecondaryPool.nativeEntries, ...PthumeruStandardSecondaryPool.ooeEntries];
  const total = totalWeight(entries);
  const pY = effectiveWeight(entries.find((e) => e.effectId === "poorman_physical")) / total;
  const pX = effectiveWeight(entries.find((e) => e.effectId === "striking_charge")) / total;
  const expected = pY / (1 - pX);

  assert.ok(Math.abs(breakdown.secondaryEffect.effective - expected) < 1e-9, `${breakdown.secondaryEffect.effective} !== ${expected}`);
});

test("呪いの排他: getEligibleCurses が conflictGroup に従って正しく除外する", () => {
  const dataset = buildTestDataset("watchers");
  const eligible = getEligibleCurses(dataset, "radiant_stamina", null).map((e) => e.curseId);
  assert.ok(!eligible.includes("stamina_cost_up"));
  assert.equal(eligible.length, 5);

  const eligible2 = getEligibleCurses(dataset, "physical", null).map((e) => e.curseId);
  assert.equal(eligible2.length, 6); // physicalはconflictGroupに存在しないので何も除外されない
});

test("ProbabilityEngine × Monte Carlo(実データ): 女幽霊はBLOCKER#1・#2とも解消済みのため実データで一致検証できる", () => {
  const target = {
    datasetId: EvilSpiritDataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "poorman_physical",
    acceptedPrimaryRanks: [17],
    acceptedSecondaryRanks: [17],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 5,
    researchEligible: true,
  };
  const { p } = computeProbability(EvilSpiritDataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 200000;
  const rng = createSeededRng(20260915);
  const gems = draw(EvilSpiritDataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "evilSpirit REAL DATA target");
});

test("ProbabilityEngine × Monte Carlo(実データ): 3デブはBLOCKER#1・#2とも解消済みのため実データで一致検証できる", () => {
  const target = {
    datasetId: WatchersDataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [17],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete"],
    desireScore: 3,
    researchEligible: true,
  };
  const { p } = computeProbability(WatchersDataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 100000;
  const rng = createSeededRng(1357);
  const gems = draw(WatchersDataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "watchers REAL DATA target");
});

test("ProbabilityEngine × Monte Carlo(実データ): 貞子はBLOCKER#1・#2とも解消済みのため実データで一致検証できる", () => {
  const target = {
    datasetId: MadmanDataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [18],
    secondaryEffectId: "striking_charge",
    acceptedSecondaryRanks: [17, 18],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 3,
    researchEligible: true,
  };
  const { p } = computeProbability(MadmanDataset, target);
  assert.ok(p > 0 && p < 1);

  const N = 200000;
  const rng = createSeededRng(2468);
  const gems = draw(MadmanDataset, N, { rng });
  const matchCount = gems.filter((g) => isMatch(g, target)).length;

  assertMatchesMonteCarlo(matchCount, N, p, "madman REAL DATA target");
});

// dataset全体を虱潰しに列挙する(コインコスト検討用のcomputeGemProbabilityの正しさを
// 独立に検証するためのテスト専用ヘルパー。DrawEngine/ProbabilityEngine本体には持ち込まない)。
function enumerateGems(dataset) {
  const shapeIds = dataset.shapeTable.entries.map((e) => e.shapeId);
  const primaryEntries = [...dataset.effectPools.primary.nativeEntries, ...dataset.effectPools.primary.ooeEntries];
  const curseIds = dataset.cursePool.entries.map((e) => e.curseId);
  const gems = [];
  for (const shapeId of shapeIds) {
    for (const primaryEntry of primaryEntries) {
      for (const primaryValueRank of dataset.primaryRankTiers) {
        const secondaryCombos = [];
        if (dataset.enemy.secondarySlot === "selectable") {
          const secondaryEntries = [...dataset.effectPools.secondary.nativeEntries, ...dataset.effectPools.secondary.ooeEntries];
          for (const secondaryEntry of secondaryEntries) {
            for (const secondaryValueRank of dataset.secondaryRankTiers) {
              secondaryCombos.push({ secondaryEffectId: secondaryEntry.effectId, secondaryValueRank });
            }
          }
        } else if (dataset.enemy.secondarySlot === "fixed") {
          for (const secondaryValueRank of dataset.secondaryRankTiers) {
            secondaryCombos.push({ secondaryEffectId: dataset.enemy.fixedSecondaryEffectId, secondaryValueRank });
          }
        } else {
          secondaryCombos.push({ secondaryEffectId: null, secondaryValueRank: null });
        }
        for (const secondary of secondaryCombos) {
          for (const curseId of curseIds) {
            gems.push({
              datasetId: dataset.datasetId,
              shapeId,
              primaryEffectId: primaryEntry.effectId,
              primaryValueRank,
              secondaryEffectId: secondary.secondaryEffectId,
              secondaryValueRank: secondary.secondaryValueRank,
              curseId,
            });
          }
        }
      }
    }
  }
  return gems;
}

test("computeGemProbability: 3デブ(secondaryなし)の全組み合わせを列挙するとp合計が1になる", () => {
  const dataset = buildTestDataset("watchers");
  const gems = enumerateGems(dataset);
  const total = gems.reduce((sum, gem) => sum + computeGemProbability(dataset, gem).p, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `sum of p over full enumeration = ${total}, expected 1`);
});

test("computeGemProbability: 貞子(selectable secondary)の全組み合わせを列挙するとp合計が1になる", () => {
  const dataset = buildTestDataset("madman");
  const gems = enumerateGems(dataset);
  const total = gems.reduce((sum, gem) => sum + computeGemProbability(dataset, gem).p, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `sum of p over full enumeration = ${total}, expected 1`);
});

test("computeGemProbability: 女幽霊(fixed secondary)の全組み合わせを列挙するとp合計が1になる", () => {
  const dataset = buildTestDataset("evilSpirit");
  const gems = enumerateGems(dataset);
  const total = gems.reduce((sum, gem) => sum + computeGemProbability(dataset, gem).p, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `sum of p over full enumeration = ${total}, expected 1`);
});

test("computeGemProbability: 実際にdrawOneで生成した1個のgemに対し0より大きいpを返す(排他済みの組み合わせを引かない限り)", () => {
  const dataset = buildTestDataset("madman");
  const rng = createSeededRng(777);
  for (let i = 0; i < 200; i++) {
    const gem = drawOne(dataset, { rng });
    const { p } = computeGemProbability(dataset, gem);
    assert.ok(p > 0 && p <= 1, `drawOneで実際に生成されたgemのpは0より大きいはず: p=${p}`);
  }
});

test("enumerateGemProbabilities: このテストファイル独自のenumerateGems()と独立に一致する(貞子)", () => {
  const dataset = buildTestDataset("madman");
  const manual = enumerateGems(dataset)
    .map((gem) => ({ gem, p: computeGemProbability(dataset, gem).p }))
    .filter((x) => x.p > 0);
  const fromCore = enumerateGemProbabilities(dataset);

  assert.equal(fromCore.length, manual.length);
  const manualByKey = new Map(manual.map((x) => [JSON.stringify(x.gem), x.p]));
  for (const { gem, p } of fromCore) {
    const expected = manualByKey.get(JSON.stringify(gem));
    assert.ok(expected !== undefined, `enumerateGemProbabilitiesが返したgemが手動列挙に存在しない: ${JSON.stringify(gem)}`);
    assert.ok(Math.abs(expected - p) < 1e-12);
  }
});

test("enumerateGemProbabilities: p=0の組み合わせ(貞子のprimary==secondary重複)は除外されている", () => {
  const dataset = buildTestDataset("madman");
  const violating = enumerateGemProbabilities(dataset).filter(({ gem }) => gem.primaryEffectId === gem.secondaryEffectId);
  assert.equal(violating.length, 0);
});

test("computeDatasetEntropyBits: 3体ともsum(p)=1な列挙から計算され、0以上・log2(組み合わせ数)以下に収まる", () => {
  for (const key of ["watchers", "madman", "evilSpirit"]) {
    const dataset = buildTestDataset(key);
    const combos = enumerateGemProbabilities(dataset);
    const h = computeDatasetEntropyBits(dataset);
    assert.ok(h >= 0, `${key}: entropyは非負のはず (got ${h})`);
    assert.ok(h <= Math.log2(combos.length) + 1e-9, `${key}: entropyは一様分布時の上限log2(${combos.length})を超えてはいけない (got ${h})`);
  }
});

test("computeDatasetEntropyBits: 一様分布(全combo等確率)ならH=log2(組み合わせ数)に一致する(3デブ相当の合成fixture)", () => {
  // 3デブfixtureは形状(放射:三角:欠損=100:1:1)が非一様なため、代わりに全factorが一様な
  // 最小構成のdatasetをここだけで組み立てて、解析解log2(N)と厳密に一致することを検証する。
  const uniformDataset = {
    datasetId: "uniform_test",
    enemy: { enemyId: "uniform_enemy", displayName: "uniform", secondarySlot: "none", allowDuplicateSecondary: false },
    shapeTable: { shapeTableId: "s", entries: [{ shapeId: "a", weight: 1 }] },
    effectPools: {
      primary: {
        effectPoolId: "p",
        nativeEntries: [
          { effectId: "x", weight: 1 },
          { effectId: "y", weight: 1 },
        ],
        ooeEntries: [],
      },
    },
    cursePool: { cursePoolId: "c", entries: [{ curseId: "c1", weight: 1 }] },
    conflictGroups: { conflictGroupSetId: "cg", groups: [] },
    primaryRankTiers: [1, 2],
    secondaryRankTiers: null,
    rankTierDistribution: { primary: [1, 1], secondary: null },
  };
  const combos = enumerateGemProbabilities(uniformDataset);
  assert.equal(combos.length, 4); // 1 shape × 2 primary effect × 2 rank × 1 curse
  const h = computeDatasetEntropyBits(uniformDataset);
  assert.ok(Math.abs(h - Math.log2(4)) < 1e-9, `一様4通りのentropyはlog2(4)=2 bitsのはず (got ${h})`);
});

test("貞子(実データ): primaryValueRankとsecondaryValueRankは同一乱数・同一Rankに連動しない(独立抽選)", () => {
  const rng = createSeededRng(31415);
  const gems = draw(MadmanDataset, 20000, { rng });

  const overall = { 16: 0, 17: 0, 18: 0 };
  for (const g of gems) overall[g.secondaryValueRank]++;
  const overallTotal = gems.length;

  for (const primaryRank of [16, 17, 18]) {
    const subset = gems.filter((g) => g.primaryValueRank === primaryRank);
    const counts = { 16: 0, 17: 0, 18: 0 };
    for (const g of subset) counts[g.secondaryValueRank]++;
    for (const secRank of [16, 17, 18]) {
      const subsetRatio = counts[secRank] / subset.length;
      const overallRatio = overall[secRank] / overallTotal;
      assert.ok(
        Math.abs(subsetRatio - overallRatio) < 0.05,
        `primaryRank=${primaryRank}のときsecondaryRank=${secRank}の比率が全体と乖離しすぎている: ${subsetRatio} vs ${overallRatio}`
      );
    }
  }

  const seenCombos = new Set(gems.map((g) => `${g.primaryValueRank}-${g.secondaryValueRank}`));
  assert.equal(seenCombos.size, 9, `9通りの組み合わせが全て出現するはずが${seenCombos.size}通りしか出現しなかった`);
});
