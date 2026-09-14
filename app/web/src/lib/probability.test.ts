import { describe, expect, it } from "vitest";
import { cumulativeMatchProbability } from "./probability";

describe("lib/probability: cumulativeMatchProbability", () => {
  it("P(X<=n) = 1-(1-p)^n を正しく計算する", () => {
    expect(cumulativeMatchProbability(0.5, 1)).toBeCloseTo(0.5, 10);
    expect(cumulativeMatchProbability(0.5, 2)).toBeCloseTo(0.75, 10);
    expect(cumulativeMatchProbability(0.1, 10)).toBeCloseTo(1 - Math.pow(0.9, 10), 10);
  });

  it("p<=0 または rollCount<=0 のときは0を返す", () => {
    expect(cumulativeMatchProbability(0, 10)).toBe(0);
    expect(cumulativeMatchProbability(0.5, 0)).toBe(0);
    expect(cumulativeMatchProbability(-0.1, 10)).toBe(0);
  });

  it("p>=1 のときは1を返す", () => {
    expect(cumulativeMatchProbability(1, 5)).toBe(1);
  });
});
