// BLOCKER#1(primary pool未確定)・BLOCKER#2(rank-tier分布未確定)は両方とも解消済み。
// 本ファイルは、かつて例外を投げていた経路が今は正しく動作すること(退行していないこと)を確認する
// 回帰テストとして維持する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/engine/drawEngine.js";
import { computeProbability } from "../src/engine/probabilityEngine.js";
import { WatchersDataset, MadmanDataset, EvilSpiritDataset } from "../src/data/datasets.js";
import { PTHUMERU_STANDARD_PRIMARY_POOL_KNOWN_EFFECT_IDS } from "../src/data/primaryPool.js";

const knownPrimaryIds = new Set(PTHUMERU_STANDARD_PRIMARY_POOL_KNOWN_EFFECT_IDS);

test("実データでのdraw(): 3体とも正常に抽選できる(BLOCKER#1・#2とも解消済み)", () => {
  const wg = draw(WatchersDataset, 50);
  assert.equal(wg.length, 50);
  for (const gem of wg) {
    assert.ok(knownPrimaryIds.has(gem.primaryEffectId));
    assert.ok([17, 18, 19].includes(gem.primaryValueRank));
    assert.equal(gem.secondaryEffectId, null);
  }

  const mg = draw(MadmanDataset, 50);
  assert.equal(mg.length, 50);
  for (const gem of mg) {
    assert.ok(knownPrimaryIds.has(gem.primaryEffectId));
    assert.ok([16, 17, 18].includes(gem.primaryValueRank));
    assert.ok(gem.secondaryEffectId);
    assert.ok([16, 17, 18].includes(gem.secondaryValueRank));
    assert.notEqual(gem.primaryEffectId, gem.secondaryEffectId);
  }

  const eg = draw(EvilSpiritDataset, 50);
  assert.equal(eg.length, 50);
  for (const gem of eg) {
    assert.equal(gem.secondaryEffectId, "poorman_physical");
    assert.ok([15, 16, 17].includes(gem.primaryValueRank));
    assert.ok([15, 16, 17].includes(gem.secondaryValueRank));
  }
});

test("実データでのcomputeProbability(): 3体とも正常に計算できる", () => {
  const watchersTarget = {
    datasetId: WatchersDataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [17],
    acceptedCurses: ["stamina_cost_up"],
    desireScore: 3,
    researchEligible: true,
  };
  const w = computeProbability(WatchersDataset, watchersTarget);
  assert.ok(w.p > 0 && w.p < 1);

  const madmanTarget = {
    datasetId: MadmanDataset.datasetId,
    acceptedShapes: ["radial"],
    primaryEffectId: "physical",
    acceptedPrimaryRanks: [18],
    secondaryEffectId: "odd_physical",
    acceptedSecondaryRanks: [18],
    acceptedCurses: ["stamina_cost_up"],
    desireScore: 3,
    researchEligible: true,
  };
  const mProb = computeProbability(MadmanDataset, madmanTarget);
  assert.ok(mProb.p > 0 && mProb.p < 1);

  const evilSpiritTarget = {
    datasetId: EvilSpiritDataset.datasetId,
    acceptedShapes: ["radial", "triangle", "waning"],
    primaryEffectId: "poorman_physical",
    acceptedPrimaryRanks: [17],
    acceptedSecondaryRanks: [17],
    acceptedCurses: ["stamina_cost_up", "kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"],
    desireScore: 5,
    researchEligible: true,
  };
  const e = computeProbability(EvilSpiritDataset, evilSpiritTarget);
  assert.ok(e.p > 0 && e.p < 1);
});
