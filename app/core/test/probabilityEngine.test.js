import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, getEligibleCurses } from "../src/engine/drawEngine.js";
import { computeProbability } from "../src/engine/probabilityEngine.js";
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
