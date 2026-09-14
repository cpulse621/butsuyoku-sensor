import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/engine/drawEngine.js";
import { createSeededRng } from "../src/engine/rng.js";
import { buildTestDataset } from "./fixtures/testDataset.js";

test("貞子(madman): primaryとsecondaryが同一effectIdになることは絶対に無い(4.1節の排他)", () => {
  const dataset = buildTestDataset("madman");
  const rng = createSeededRng(42);
  const gems = draw(dataset, 5000, { rng });
  assert.equal(gems.length, 5000);
  for (const gem of gems) {
    assert.notEqual(gem.primaryEffectId, gem.secondaryEffectId);
    assert.ok(gem.secondaryEffectId, "secondaryEffectIdが生成されていない");
  }
});

test("貞子(madman): primaryValueRankとsecondaryValueRankは独立に抽選される(相関しない)", () => {
  const dataset = buildTestDataset("madman");
  const rng = createSeededRng(7);
  const gems = draw(dataset, 20000, { rng });

  // 独立なら、primaryRank=Xの集合の中でのsecondaryRankの分布は、全体のsecondaryRank分布と近い値になるはず。
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
      // サンプル数が十分あるので、独立ならこの差は小さいはず(緩めの許容誤差5%pt)
      assert.ok(
        Math.abs(subsetRatio - overallRatio) < 0.05,
        `primaryRank=${primaryRank}のときsecondaryRank=${secRank}の比率が全体と乖離しすぎている: ${subsetRatio} vs ${overallRatio}`
      );
    }
  }

  // 全ての(primaryRank, secondaryRank)の組み合わせが実際に出現すること(独立抽選の直接証拠)
  const seenCombos = new Set(gems.map((g) => `${g.primaryValueRank}-${g.secondaryValueRank}`));
  assert.equal(seenCombos.size, 9, `9通りの組み合わせが全て出現するはずが${seenCombos.size}通りしか出現しなかった`);
});
