import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SurveyForm } from "./SurveyForm";

describe("SurveyForm", () => {
  it("3問すべてに回答するまで「結果を見る」は押せない", () => {
    const onSubmit = vi.fn();
    render(<SurveyForm onSubmit={onSubmit} />);

    const submitButton = screen.getByRole("button", { name: "結果を見る" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    const scoreRows = document.querySelectorAll(".survey-question");
    expect(scoreRows).toHaveLength(3);

    // Q1のみ回答
    fireEvent.click(within(scoreRows[0]).getButtonByScore("3"));
    expect(submitButton.disabled).toBe(true);

    // Q2も回答
    fireEvent.click(within(scoreRows[1]).getButtonByScore("2"));
    expect(submitButton.disabled).toBe(true);

    // Q3も回答して初めて押せるようになる
    fireEvent.click(within(scoreRows[2]).getButtonByScore("5"));
    expect(submitButton.disabled).toBe(false);

    fireEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledWith({ tediousnessScore: 3, painIfRepeatedScore: 2, sensorScore: 5 });
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
