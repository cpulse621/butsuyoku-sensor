import { test } from "node:test";
import assert from "node:assert/strict";
import { PthumeruStandardSecondaryPool } from "../src/data/secondaryPool.js";
import { PthumeruStandardCursePool, PthumeruCommonConflictGroups } from "../src/data/cursePool.js";
import { PthumeruStandardPrimaryPool, PTHUMERU_STANDARD_PRIMARY_POOL_KNOWN_EFFECT_IDS } from "../src/data/primaryPool.js";
import { MadmanEffectValueBindings } from "../src/data/valueSeries/madman.js";
import { EvilSpiritEffectValueBindings } from "../src/data/valueSeries/evilSpirit.js";

test("secondary pool: 19項目、ID重複なし、合計100.0000%(仕様書3.5節の検算)", () => {
  const entries = [...PthumeruStandardSecondaryPool.nativeEntries, ...PthumeruStandardSecondaryPool.ooeEntries];
  assert.equal(entries.length, 19);
  const ids = entries.map((e) => e.effectId);
  assert.equal(new Set(ids).size, 19, "effectIdの重複がある");
  const sum = entries.reduce((s, e) => s + e.probabilityPct, 0);
  assert.ok(Math.abs(sum - 100) < 1e-3, `合計が100%から乖離している: ${sum}`);
});

test("curse pool: 6項目、conflict group: 6件、positiveEffectId重複なし", () => {
  assert.equal(PthumeruStandardCursePool.entries.length, 6);
  assert.equal(PthumeruCommonConflictGroups.groups.length, 6);
  const positiveIds = PthumeruCommonConflictGroups.groups.map((g) => g.positiveEffectId);
  assert.equal(new Set(positiveIds).size, 6);
});

test("primary pool: BLOCKER#1解消済み。23項目、native9/ooe14、ID重複なし、合計99.9998%(4桁丸め誤差, 再正規化しない)", () => {
  assert.equal(PthumeruStandardPrimaryPool.__blocked, undefined, "もう__blockedであってはいけない");
  assert.equal(PthumeruStandardPrimaryPool.researchUseStatus, "allowed");
  assert.equal(PthumeruStandardPrimaryPool.nativeEntries.length, 9);
  assert.equal(PthumeruStandardPrimaryPool.ooeEntries.length, 14);

  const entries = [...PthumeruStandardPrimaryPool.nativeEntries, ...PthumeruStandardPrimaryPool.ooeEntries];
  assert.equal(entries.length, 23);
  const ids = entries.map((e) => e.effectId);
  assert.equal(new Set(ids).size, 23, "23個のeffectIdに重複がある");
  assert.deepEqual(new Set(ids), new Set(PTHUMERU_STANDARD_PRIMARY_POOL_KNOWN_EFFECT_IDS), "5.2.3節から復元した既知23項目と一致しない");

  const sum = entries.reduce((s, e) => s + e.probabilityPct, 0);
  // 資料側の4桁丸めによる既知の誤差(99.9998%)。再正規化はしない(Fidelity Contract)。
  assert.ok(Math.abs(sum - 99.9998) < 1e-3, `合計が想定(99.9998%)から乖離している: ${sum}`);
});

test("貞子のEffectValueBindings: primary 18件・secondary 18件(仕様書5.2.3/5.2.4節と一致)", () => {
  const primaryBindings = MadmanEffectValueBindings.filter((b) => b.slot === "primary");
  const secondaryBindings = MadmanEffectValueBindings.filter((b) => b.slot === "secondary");
  assert.equal(primaryBindings.length, 18, "貞子Primary: 23項目中、完全TBDの5項目を除いた18項目のはず");
  assert.equal(secondaryBindings.length, 18, "貞子Secondary: 19項目中、完全TBDの1項目を除いた18項目のはず");
});

test("女幽霊のEffectValueBindings: primary 3件(Sec.1系列)・secondary 1件(Prim.1系列, fixed)", () => {
  const primaryBindings = EvilSpiritEffectValueBindings.filter((b) => b.slot === "primary");
  const secondaryBindings = EvilSpiritEffectValueBindings.filter((b) => b.slot === "secondary");
  assert.equal(primaryBindings.length, 3);
  assert.equal(secondaryBindings.length, 1);
  assert.equal(secondaryBindings[0].effectId, "poorman_physical");
});
