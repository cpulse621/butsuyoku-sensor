import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/engine/drawEngine.js";
import { createSeededRng } from "../src/engine/rng.js";
import { buildTestDataset } from "./fixtures/testDataset.js";

test("女幽霊(evilSpirit): secondaryEffectIdは常にpoorman_physical(種類抽選なし)", () => {
  const dataset = buildTestDataset("evilSpirit");
  const rng = createSeededRng(2024);
  const gems = draw(dataset, 3000, { rng });
  assert.equal(gems.length, 3000);
  for (const gem of gems) {
    assert.equal(gem.secondaryEffectId, "poorman_physical");
    assert.ok(gem.secondaryValueRank !== null);
  }
});

test("女幽霊(evilSpirit): primary=poorman_physical と fixedSecondary=poorman_physical の重複が許可される", () => {
  const dataset = buildTestDataset("evilSpirit");
  const rng = createSeededRng(31337);
  const gems = draw(dataset, 4000, { rng });
  const duplicates = gems.filter((g) => g.primaryEffectId === "poorman_physical" && g.secondaryEffectId === "poorman_physical");
  assert.ok(
    duplicates.length > 0,
    "primary=poorman_physical かつ secondary=poorman_physical の血晶が一度も出現しなかった(allowDuplicateSecondaryが機能していない可能性)"
  );
  // 参考: フィクスチャのprimary poolではpoorman_physicalの重みは10/50なので、
  // 期待出現数はおよそ 4000 * (10/50) = 800 前後になるはず(大まかな健全性チェック)
  assert.ok(duplicates.length > 400 && duplicates.length < 1200, `出現数が期待レンジから外れている: ${duplicates.length}`);
});

test("女幽霊(evilSpirit): 呪いの排他はpoorman_physicalでは何も除外しない(spec 5.3節の検算)", () => {
  const dataset = buildTestDataset("evilSpirit");
  const rng = createSeededRng(555);
  const gems = draw(dataset, 3000, { rng });
  const allCurseIds = new Set(gems.map((g) => g.curseId));
  // poorman_physicalはconflictGroupのpositiveEffectId一覧に含まれないため、
  // fixedSecondary由来で除外されるcurseは無いはず。primary側の排他は別途watchersテストで確認済み。
  // ここでは少なくとも複数種のcurseが出現していることだけ健全性チェックする。
  assert.ok(allCurseIds.size >= 2);
});
