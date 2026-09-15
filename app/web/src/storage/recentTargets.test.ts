import { beforeEach, describe, expect, it } from "vitest";
import { addRecentTarget, listRecentTargets } from "./recentTargets";
import type { StoredTarget } from "./simulationHistory";

const TARGET_A: StoredTarget = {
  shape: ["radial"],
  primary_effect_id: "physical",
  primary_allowed_ranks: [17, 18, 19],
  secondary_effect_id: null,
  secondary_allowed_ranks: null,
  accepted_curse_ids: ["stamina_cost_up"],
};

const TARGET_B: StoredTarget = {
  ...TARGET_A,
  primary_effect_id: "arcane",
};

describe("storage/recentTargets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("追加したTargetを同一dataset内で新しい順に取得できる", () => {
    addRecentTarget("dataset_a", TARGET_A);
    addRecentTarget("dataset_a", TARGET_B);
    const list = listRecentTargets("dataset_a");
    expect(list.map((e) => e.target.primary_effect_id)).toEqual(["arcane", "physical"]);
  });

  it("別のdatasetのTargetは混ざらない", () => {
    addRecentTarget("dataset_a", TARGET_A);
    addRecentTarget("dataset_b", TARGET_B);
    expect(listRecentTargets("dataset_a")).toHaveLength(1);
    expect(listRecentTargets("dataset_b")).toHaveLength(1);
  });

  it("同一内容のTargetを再度使うと重複せず先頭に移動する", () => {
    addRecentTarget("dataset_a", TARGET_A);
    addRecentTarget("dataset_a", TARGET_B);
    addRecentTarget("dataset_a", TARGET_A); // 再利用
    const list = listRecentTargets("dataset_a");
    expect(list).toHaveLength(2);
    expect(list[0].target.primary_effect_id).toBe("physical");
  });

  it("内部的にeffectId等のIDのみを保存し、日本語ラベル文字列は含まない", () => {
    addRecentTarget("dataset_a", TARGET_A);
    const raw = localStorage.getItem("motsuyoku_sensor_recent_targets_v1")!;
    expect(raw).not.toContain("物理攻撃力UP"); // 日本語ラベルが直接保存されていないこと
    expect(raw).toContain("physical"); // effectIdは保存されている
  });
});
