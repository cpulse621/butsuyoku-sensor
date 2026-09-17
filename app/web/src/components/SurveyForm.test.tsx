import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SurveyForm } from "./SurveyForm";

describe("SurveyForm", () => {
  it("5問すべてに回答するまで「結果を見る」は押せない(Q1→Q2→Q3 sensor→Q4 effort/reward→Q5 perceived rarityの順で固定)", () => {
    const onSubmit = vi.fn();
    render(<SurveyForm onSubmit={onSubmit} />);

    const submitButton = screen.getByRole("button", { name: "結果を見る" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    const scoreRows = document.querySelectorAll(".survey-question");
    expect(scoreRows).toHaveLength(5);

    // Q1のみ回答
    fireEvent.click(within(scoreRows[0]).getButtonByScore("3"));
    expect(submitButton.disabled).toBe(true);

    // Q2も回答
    fireEvent.click(within(scoreRows[1]).getButtonByScore("2"));
    expect(submitButton.disabled).toBe(true);

    // Q3 sensorも回答
    fireEvent.click(within(scoreRows[2]).getButtonByScore("5"));
    expect(submitButton.disabled).toBe(true);

    // Q4 effort/reward fitも回答
    fireEvent.click(within(scoreRows[3]).getButtonByScore("4"));
    expect(submitButton.disabled).toBe(true);

    // Q5 perceived rarity(スライダー、1-2-5系列)も回答して初めて押せるようになる
    const slider = scoreRows[4].querySelector("input[type='range']") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "6" } }); // [1,2,5,10,20,50,100,...]のindex=6 -> 100
    expect(submitButton.disabled).toBe(false);

    fireEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledWith({
      tediousnessScore: 3,
      painIfRepeatedScore: 2,
      sensorScore: 5,
      effortRewardFitScore: 4,
      perceivedExpectedDraws: 100,
    });
  });

  it("Q5で「わからない」を選ぶと、perceivedExpectedDraws=nullのまま送信できる(推測値を強制しない)", () => {
    const onSubmit = vi.fn();
    render(<SurveyForm onSubmit={onSubmit} />);

    const submitButton = screen.getByRole("button", { name: "結果を見る" }) as HTMLButtonElement;
    const scoreRows = document.querySelectorAll(".survey-question");

    fireEvent.click(within(scoreRows[0]).getButtonByScore("1"));
    fireEvent.click(within(scoreRows[1]).getButtonByScore("1"));
    fireEvent.click(within(scoreRows[2]).getButtonByScore("1"));
    fireEvent.click(within(scoreRows[3]).getButtonByScore("1"));
    expect(submitButton.disabled).toBe(true); // Q5未回答のうちはまだ押せない

    const dontKnowButton = [...scoreRows[4].querySelectorAll("button")].find((b) => b.textContent?.trim() === "わからない")!;
    fireEvent.click(dontKnowButton);
    expect(submitButton.disabled).toBe(false); // 「わからない」も回答扱いになる

    fireEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        perceivedExpectedDraws: null,
      })
    );
  });
});

// scoreの数字ボタンをテキストで探す小さなヘルパー(scoped to a container element)。
function within(container: Element) {
  return {
    getButtonByScore(score: string) {
      const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === score);
      if (!btn) throw new Error(`score button "${score}" not found`);
      return btn;
    },
  };
}
