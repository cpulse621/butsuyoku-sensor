import { describe, expect, it } from "vitest";
import { curseLabel, effectLabel, enemyLabel, matchStatusLabel, shapeLabel } from "./labels";

describe("i18n/labels", () => {
  it("既知のenemyId/shapeId/effectId/curseIdを日本語ラベルへ変換する", () => {
    expect(enemyLabel("merciless_watchers")).toBe("3デブ");
    expect(enemyLabel("labyrinth_madman")).toBe("貞子");
    expect(enemyLabel("evil_labyrinth_spirit")).toBe("女幽霊");

    expect(shapeLabel("radial")).toBe("放射");
    expect(shapeLabel("triangle")).toBe("三角");
    expect(shapeLabel("waning")).toBe("欠損");

    expect(effectLabel("physical")).toBe("物理攻撃力UP");
    expect(effectLabel("odd_physical")).toBe("物理攻撃力加算");

    expect(curseLabel("stamina_cost_up")).toBe("スタミナ消費増加");
  });

  it("未知のIDが来てもクラッシュせず、整形済みのID自体へfallbackする", () => {
    expect(enemyLabel("unknown_enemy_xyz")).toBe("unknown enemy xyz");
    expect(effectLabel("some_future_effect")).toBe("some future effect");
    expect(curseLabel("some_future_curse")).toBe("some future curse");
    expect(shapeLabel("hexagon")).toBe("hexagon");
  });

  it("Primary/Secondaryで同じeffectIdは同じラベルを返す(スロットに依存しない)", () => {
    // physicalはprimaryとしてもsecondaryとしても同じ日本語名を使う想定
    expect(effectLabel("physical")).toBe("物理攻撃力UP");
    expect(effectLabel("beasthunter")).toBe("対獣攻撃力UP");
  });

  it("matchStatusLabel: MATCH/MISS/未設定を正しく変換する", () => {
    expect(matchStatusLabel(true)).toBe("条件一致");
    expect(matchStatusLabel(false)).toBe("条件外");
    expect(matchStatusLabel(null)).toBe("Target未設定");
  });
});
