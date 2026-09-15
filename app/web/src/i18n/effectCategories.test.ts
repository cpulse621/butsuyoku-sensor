import { describe, expect, it } from "vitest";
import { categoryForEffect, groupEffectIdsByCategory, EFFECT_CATEGORIES } from "./effectCategories";

describe("i18n/effectCategories", () => {
  it("カテゴリ内にeffectIdの重複がない", () => {
    const seen = new Set<string>();
    for (const cat of EFFECT_CATEGORIES) {
      for (const id of cat.effectIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("既知のeffectIdは対応するカテゴリを返す", () => {
    expect(categoryForEffect("physical")).toBe("物理系");
    expect(categoryForEffect("fire")).toBe("属性");
    expect(categoryForEffect("beasthunter")).toBe("対種族");
  });

  it("未知のeffectIdは「その他」へfallbackする(クラッシュしない)", () => {
    expect(categoryForEffect("some_future_effect")).toBe("その他");
  });

  it("groupEffectIdsByCategoryは与えたIDだけをカテゴリ分けし、未分類は「その他」に合流する", () => {
    const groups = groupEffectIdsByCategory(["physical", "fire", "unknown_future_effect"]);
    const other = groups.find((g) => g.name === "その他");
    expect(other?.effectIds).toContain("unknown_future_effect");
    const physicalGroup = groups.find((g) => g.name === "物理系");
    expect(physicalGroup?.effectIds).toEqual(["physical"]);
    // 空のカテゴリは含めない
    expect(groups.every((g) => g.effectIds.length > 0)).toBe(true);
  });
});
