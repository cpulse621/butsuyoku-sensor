import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GemDataset } from "motsuyoku-sensor-core";
import type { RevealedEntry } from "../hooks/useResearchSession";
import { ResearchRevealList } from "./ResearchRevealList";

const DATASET = {
  enemy: { secondarySlot: "none" },
  effectValueBindings: [],
  valueSeriesById: {},
} as unknown as GemDataset;

function makeEntry(rollCount: number, matched: boolean): RevealedEntry {
  return {
    rollCount,
    matched,
    gem: {
      datasetId: "test_dataset",
      shapeId: "radial",
      primaryEffectId: "physical",
      primaryValueRank: 18,
      secondaryEffectId: null,
      secondaryValueRank: null,
      curseId: "stamina_cost_up",
    },
  };
}

describe("components/ResearchRevealList", () => {
  beforeEach(() => {
    // jsdomはscrollIntoViewを実装していないため、呼び出し検知用にstubする。
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("結果が0件のときは案内文のみ表示する(まだ何も一括表示しない)", () => {
    const { container } = render(<ResearchRevealList dataset={DATASET} revealed={[]} />);
    expect(container.querySelectorAll(".reveal-row")).toHaveLength(0);
    expect(container.textContent).toContain("1件ずつ表示されます");
  });

  it("渡された件数ぶんだけ行を描画し、新しい結果が増えるたびに最新行までscrollIntoViewする", () => {
    const scrollSpy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;

    const { container, rerender } = render(<ResearchRevealList dataset={DATASET} revealed={[makeEntry(1, false)]} />);
    expect(container.querySelectorAll(".reveal-row")).toHaveLength(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });

    rerender(<ResearchRevealList dataset={DATASET} revealed={[makeEntry(1, false), makeEntry(2, false)]} />);
    expect(container.querySelectorAll(".reveal-row")).toHaveLength(2);
    expect(scrollSpy).toHaveBeenCalledTimes(2); // 件数が増えるたびに追従スクロールする

    rerender(<ResearchRevealList dataset={DATASET} revealed={[makeEntry(1, false), makeEntry(2, false), makeEntry(3, true)]} />);
    const rows = container.querySelectorAll(".reveal-row");
    expect(rows).toHaveLength(3);
    expect(rows[2].className).toContain("reveal-row--match");
  });
});
