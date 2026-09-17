import { describe, expect, it } from "vitest";
import { WatchersDataset } from "motsuyoku-sensor-core";
import { RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWS, isTargetResearchEligible } from "./researchEligibility";

describe("lib/researchEligibility", () => {
  it("expected_draws<=1,000のTargetはeligibleと判定する(3デブ: 1opランクを広く許容)", () => {
    const easyTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["radial", "triangle", "waning"],
      primaryEffectId: "physical",
      acceptedPrimaryRanks: [17, 18, 19],
      acceptedCurses: WatchersDataset.cursePool.entries.map((e) => e.curseId),
    };
    expect(isTargetResearchEligible(WatchersDataset, easyTarget)).toBe(true);
  });

  it("expected_draws>1,000のTargetはeligibleと判定しない(rank・呪いを1つずつに絞って狭める)", () => {
    const hardTarget = {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["waning"], // 最も出にくい形状のみ
      primaryEffectId: "physical",
      acceptedPrimaryRanks: [17], // 1rankのみ
      acceptedCurses: ["stamina_cost_up"], // 1呪いのみ
    };
    expect(isTargetResearchEligible(WatchersDataset, hardTarget)).toBe(false);
  });

  it("RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWSは1,000で確定している", () => {
    expect(RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWS).toBe(1000);
  });
});
