import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/engine/drawEngine.js";
import { createSeededRng } from "../src/engine/rng.js";
import { buildTestDataset } from "./fixtures/testDataset.js";

test("3デブ(watchers): secondaryは常にnull(2opが存在しない)", () => {
  const dataset = buildTestDataset("watchers");
  const rng = createSeededRng(12345);
  const gems = draw(dataset, 2000, { rng });
  assert.equal(gems.length, 2000);
  for (const gem of gems) {
    assert.equal(gem.secondaryEffectId, null);
    assert.equal(gem.secondaryValueRank, null);
    assert.ok(gem.primaryEffectId);
    assert.ok(gem.curseId);
    assert.ok(["radial", "triangle", "waning"].includes(gem.shapeId));
  }
});

test("3デブ(watchers): 呪いの排他が正しく効く(radiant_staminaを引いたらstamina_cost_upは出ない)", () => {
  const dataset = buildTestDataset("watchers");
  const rng = createSeededRng(999);
  const gems = draw(dataset, 5000, { rng });
  const radiantGems = gems.filter((g) => g.primaryEffectId === "radiant_stamina");
  assert.ok(radiantGems.length > 0, "radiant_staminaが一度も出ていない(テスト前提が崩れている)");
  for (const g of radiantGems) {
    assert.notEqual(g.curseId, "stamina_cost_up");
  }
  const kinGems = gems.filter((g) => g.primaryEffectId === "kinhunter");
  for (const g of kinGems) assert.notEqual(g.curseId, "kin_attack_down");
  const beastGems = gems.filter((g) => g.primaryEffectId === "beasthunter");
  for (const g of beastGems) assert.notEqual(g.curseId, "beast_attack_down");
});
