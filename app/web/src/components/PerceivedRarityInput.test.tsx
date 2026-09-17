import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PERCEIVED_RARITY_STEPS, PerceivedRarityInput } from "./PerceivedRarityInput";

// Q5は自由な連続log sliderではなく、1-2-5系列の離散値+「わからない」に厳密に限定する
// (仕様確定事項)。スライダー自体はindex(0..N-1, step=1)を動かすだけで、実際に選べる値は
// 常にこの配列のいずれかであることをロックする。
describe("PerceivedRarityInput", () => {
  it("PERCEIVED_RARITY_STEPSは1-2-5系列(1〜100000)である", () => {
    expect(PERCEIVED_RARITY_STEPS).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]);
  });

  it("スライダーはindexベース(min=0, max=系列長-1, step=1)で、系列外の値を選べない", () => {
    const onChange = vi.fn();
    // answered=falseは「まだ何も回答していない」状態(わからないを選んだ結果のvalue=nullと区別)。
    const { container } = render(<PerceivedRarityInput answered={false} value={null} onChange={onChange} />);
    const slider = container.querySelector("input[type='range']") as HTMLInputElement;

    expect(slider.min).toBe("0");
    expect(slider.max).toBe(String(PERCEIVED_RARITY_STEPS.length - 1));
    expect(slider.step).toBe("1");
  });

  it("スライダーを動かすと、onChangeにはPERCEIVED_RARITY_STEPSの要素のみが渡される", () => {
    const onChange = vi.fn();
    const { container } = render(<PerceivedRarityInput answered={false} value={null} onChange={onChange} />);
    const slider = container.querySelector("input[type='range']") as HTMLInputElement;

    // 初期DOM値(index=0)と同じ値へのfireEvent.changeはReactのvalueTrackerにより
    // onChangeが発火しないため、まず末尾へ動かしてから0を含む全indexを検証する。
    fireEvent.change(slider, { target: { value: String(PERCEIVED_RARITY_STEPS.length - 1) } });
    for (let index = 0; index < PERCEIVED_RARITY_STEPS.length; index++) {
      fireEvent.change(slider, { target: { value: String(index) } });
      expect(onChange).toHaveBeenLastCalledWith(PERCEIVED_RARITY_STEPS[index]);
    }
  });

  it("「わからない」を押すとonChange(null)が呼ばれる", () => {
    const onChange = vi.fn();
    const { getByText } = render(<PerceivedRarityInput answered value={1000} onChange={onChange} />);
    fireEvent.click(getByText("わからない"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
