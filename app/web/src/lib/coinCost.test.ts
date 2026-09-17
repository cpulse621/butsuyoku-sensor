import { describe, expect, it } from "vitest";
import { COIN_COST_OPTIONS, INITIAL_COIN, computeNormalizedSurprisalCost, surprisalBits } from "./coinCost";

describe("lib/coinCost", () => {
  it("surprisalBitsはp=0.5でちょうど1bitを返す", () => {
    expect(surprisalBits(0.5)).toBeCloseTo(1);
  });

  it("computeNormalizedSurprisalCost: p=H相当(surprisal=entropy)ならroundingなしでbaseちょうどになる", () => {
    // I(g) = H となるp = 2^-H を作り、cost = base * H/H = base となることを確認する。
    const h = 4; // bits
    const p = Math.pow(2, -h);
    const cost = computeNormalizedSurprisalCost(p, h, { base: 100, rounding: "round", minCost: 1 });
    expect(cost).toBe(100);
  });

  it("低確率(高surprisal)ほど高costになる(単調増加)", () => {
    const h = 5;
    const commonCost = computeNormalizedSurprisalCost(0.5, h, { base: 100, rounding: "round", minCost: 1 });
    const rareCost = computeNormalizedSurprisalCost(0.0001, h, { base: 100, rounding: "round", minCost: 1 });
    expect(rareCost).toBeGreaterThan(commonCost);
  });

  it("floor/ceil/roundで丸め方向が異なる(端数が出るケース)", () => {
    const h = 3;
    const p = Math.pow(2, -3.5); // raw = base * 3.5/3 = 116.67
    const opts = { base: 100, minCost: 1 } as const;
    const floored = computeNormalizedSurprisalCost(p, h, { ...opts, rounding: "floor" });
    const ceiled = computeNormalizedSurprisalCost(p, h, { ...opts, rounding: "ceil" });
    const rounded = computeNormalizedSurprisalCost(p, h, { ...opts, rounding: "round" });
    expect(floored).toBeLessThan(ceiled);
    expect(rounded).toBeGreaterThanOrEqual(floored);
    expect(rounded).toBeLessThanOrEqual(ceiled);
  });

  it("minCostにより、丸めで0以下になるはずのcostが必ず下限で保証される(0 coin消費を防ぐ)", () => {
    const h = 100; // 非常に大きいentropyにして raw cost を1未満に潰す
    const p = 0.5; // I(g)=1bit, raw = base * 1/100 = 1程度未満になりうる
    const cost = computeNormalizedSurprisalCost(p, h, { base: 1, rounding: "floor", minCost: 1 });
    expect(cost).toBeGreaterThanOrEqual(1);
    expect(cost).not.toBe(0);
  });

  it("p<=0またはdatasetEntropyBits<=0はエラーにする(未定義な計算を握りつぶさない)", () => {
    expect(() => computeNormalizedSurprisalCost(0, 5, { base: 100, rounding: "round", minCost: 1 })).toThrow();
    expect(() => computeNormalizedSurprisalCost(0.1, 0, { base: 100, rounding: "round", minCost: 1 })).toThrow();
  });

  it("COIN_COST_OPTIONSはbase=100/round/minCost=1で確定したproduction設定と一致する", () => {
    expect(COIN_COST_OPTIONS).toEqual({ base: 100, rounding: "round", minCost: 1 });
  });

  it("INITIAL_COINはbudget horizon(≈initial_coin/base)が約1,000drawになる確定値", () => {
    expect(INITIAL_COIN).toBe(100000);
    expect(INITIAL_COIN / COIN_COST_OPTIONS.base).toBe(1000);
  });
});
