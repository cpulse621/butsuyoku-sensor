import { describe, expect, it } from "vitest";
import { WatchersDataset, MadmanDataset } from "motsuyoku-sensor-core";
import { isTargetResearchEligible } from "./researchEligibility";

describe("lib/researchEligibility", () => {
  it("高確率のTargetはeligibleと判定する(3デブ: 1opランクを広く許容)", () => {
    const easyTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["radial", "triangle", "waning"],
      primaryEffectId: "physical",
      acceptedPrimaryRanks: [17, 18, 19],
      acceptedCurses: WatchersDataset.cursePool.entries.map((e) => e.curseId),
    };
    expect(isTargetResearchEligible(WatchersDataset, easyTarget)).toBe(true);
  });

  // 方針(2026-09-19): 低確率であること自体を理由にTargetを選択不可にしない。
  // 以前はexpected_draws>1,000のTargetをeligible=falseとしていたが、この足切りは撤廃した。
  // p>0(ProbabilityEngine上で理論確率を正しく計算できる)である限り、確率がどれだけ低くても
  // eligibleと判定する。
  it("expected_draws>1,000の低確率なTargetでも、p>0であればeligibleと判定する(rank・呪いを1つずつに絞って狭める)", () => {
    const hardTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["waning"], // 最も出にくい形状のみ
      primaryEffectId: "physical",
      acceptedPrimaryRanks: [17], // 1rankのみ
      acceptedCurses: ["stamina_cost_up"], // 1呪いのみ
    };
    expect(isTargetResearchEligible(WatchersDataset, hardTarget)).toBe(true);
  });

  it("極端に低い確率(1形状×1rank×1呪いまで絞った最狭Target)でもp>0であればeligibleと判定する", () => {
    const extremeTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["waning"],
      primaryEffectId: "beasthunter", // ooeEntries側の希少な効果
      acceptedPrimaryRanks: [17],
      acceptedCurses: ["stamina_cost_up"],
    };
    const outcome = isTargetResearchEligible(WatchersDataset, extremeTarget);
    expect(outcome).toBe(true);
  });

  it("EffectPool/排他条件上そもそも成立しない(p=0の)組み合わせはeligibleと判定しない(貞子: primary==secondaryかつallowDuplicateSecondary=false)", () => {
    const impossibleTarget = {
      datasetId: MadmanDataset.datasetId,
      acceptedShapes: ["radial", "triangle", "waning"],
      primaryEffectId: "striking_charge",
      acceptedPrimaryRanks: [16, 17, 18],
      secondaryEffectId: "striking_charge",
      acceptedSecondaryRanks: [16, 17, 18],
      acceptedCurses: MadmanDataset.cursePool.entries.map((e) => e.curseId),
    };
    expect(isTargetResearchEligible(MadmanDataset, impossibleTarget)).toBe(false);
  });

  it("EffectPoolに存在しない効果IDを指定した場合もp=0となりeligibleと判定しない", () => {
    const nonexistentTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["radial"],
      primaryEffectId: "this_effect_id_does_not_exist_in_any_pool",
      acceptedPrimaryRanks: [17, 18, 19],
      acceptedCurses: ["stamina_cost_up"],
    };
    expect(isTargetResearchEligible(WatchersDataset, nonexistentTarget)).toBe(false);
  });
});
