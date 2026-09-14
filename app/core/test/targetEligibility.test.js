import { test } from "node:test";
import assert from "node:assert/strict";
import { getResearchTargetCatalog, getEligibleTargetValues } from "../src/research/targetEligibility.js";
import { WatchersDataset, MadmanDataset, EvilSpiritDataset } from "../src/data/datasets.js";

test("研究モード: primaryはBLOCKER#1解消により3体とも23件のTarget候補になる(プールレベルはallowed)", () => {
  for (const dataset of [WatchersDataset, MadmanDataset, EvilSpiritDataset]) {
    const catalog = getResearchTargetCatalog(dataset, "primary");
    assert.equal(catalog.length, 23, `${dataset.datasetId}: primary pool now has 23 known effects`);
    for (const entry of catalog) assert.equal(entry.poolLevelGate, "allowed");
  }
});

test("研究モード: 3デブのprimaryは17項目が数値選択可能、6項目はeffectId一致のみ", () => {
  const catalog = getResearchTargetCatalog(WatchersDataset, "primary");
  const selectable = catalog.filter((c) => c.exactValueSelectable);
  const notSelectable = catalog.filter((c) => !c.exactValueSelectable);
  assert.equal(selectable.length, 17);
  assert.equal(notSelectable.length, 6);
  const notSelectableIds = notSelectable.map((c) => c.effectId).sort();
  assert.deepEqual(notSelectableIds, ["fools_all", "fools_physical", "nourishing", "poorman_all", "pulsing_hp_regen", "radiant_stamina"].sort());
});

test("研究モード: 貞子のprimaryは18項目が数値選択可能、5項目はeffectId一致のみ(5.2.3/5.2.4節)", () => {
  const catalog = getResearchTargetCatalog(MadmanDataset, "primary");
  const selectable = catalog.filter((c) => c.exactValueSelectable);
  const notSelectable = catalog.filter((c) => !c.exactValueSelectable);
  assert.equal(selectable.length, 18);
  assert.equal(notSelectable.length, 5);
  const notSelectableIds = notSelectable.map((c) => c.effectId).sort();
  assert.deepEqual(notSelectableIds, ["blood", "cold_arc_scaling", "fools_all", "nourishing", "poorman_all"].sort());
});

test("研究モード: 女幽霊のprimaryは3項目のみ数値選択可能(Sec.1系列が確認できている分だけ)", () => {
  const catalog = getResearchTargetCatalog(EvilSpiritDataset, "primary");
  const selectable = catalog.filter((c) => c.exactValueSelectable);
  assert.equal(selectable.length, 3);
  assert.deepEqual(
    selectable.map((c) => c.effectId).sort(),
    ["physical", "poorman_physical", "striking_charge"].sort()
  );
  for (const c of selectable) {
    assert.deepEqual(c.confirmedRanks.map((r) => r.rank), [17]); // 女幽霊primaryはR17のみconfirmed
  }
});

test("研究モード: 貞子のsecondaryはプールレベルで19項目すべてがTarget候補になる(researchUseStatus=allowed)", () => {
  const catalog = getResearchTargetCatalog(MadmanDataset, "secondary");
  assert.equal(catalog.length, 19);

  const oddPhysical = catalog.find((c) => c.effectId === "odd_physical");
  assert.ok(oddPhysical);
  assert.equal(oddPhysical.exactValueSelectable, true);
  assert.equal(oddPhysical.confirmedRanks.length, 3); // 第一確定グループ: R16/17/18すべてconfirmed

  const poormanAll = catalog.find((c) => c.effectId === "poorman_all");
  assert.ok(poormanAll);
  assert.equal(poormanAll.exactValueSelectable, true);
  assert.equal(poormanAll.confirmedRanks.length, 1); // R18のみconfirmed

  // 完全TBDでも、プールレベルの許可は満たしているのでカタログ自体には残る(数値選択はできない)
  const foolsAll = catalog.find((c) => c.effectId === "fools_all");
  assert.ok(foolsAll, "fools_allはプールレベルでは許可されているためカタログに残るべき");
  assert.equal(foolsAll.exactValueSelectable, false);
  assert.equal(foolsAll.confirmedRanks.length, 0);
});

test("研究モード: 女幽霊のsecondaryはfixed(poorman_physical)一件のみ、R17のみ数値選択可能", () => {
  const catalog = getResearchTargetCatalog(EvilSpiritDataset, "secondary");
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].effectId, "poorman_physical");
  assert.equal(catalog[0].exactValueSelectable, true);
  assert.deepEqual(
    catalog[0].confirmedRanks.map((r) => r.rank),
    [17]
  );
});

test("研究モード: 3デブのsecondaryは常に0件(secondarySlot=none)", () => {
  const catalog = getResearchTargetCatalog(WatchersDataset, "secondary");
  assert.equal(catalog.length, 0);
});

test("値レベルのゲート: getEligibleTargetValuesはconfirmedなrankのみ返す", () => {
  const values = getEligibleTargetValues(MadmanDataset, "primary", "physical");
  assert.deepEqual(
    values.map((v) => v.rank).sort(),
    [16, 17, 18]
  );
  const unconfirmed = getEligibleTargetValues(MadmanDataset, "primary", "warm_blt_scaling");
  assert.deepEqual(
    unconfirmed.map((v) => v.rank),
    [18]
  );
});
