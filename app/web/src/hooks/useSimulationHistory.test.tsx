import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BloodGem, GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { useSimulationHistory } from "./useSimulationHistory";
import { listSessions } from "../storage/simulationHistory";

const DATASET = {
  datasetId: "test_dataset",
  enemy: { enemyId: "merciless_watchers", displayName: "3デブ", secondarySlot: "none", allowDuplicateSecondary: false },
} as unknown as GemDataset;

function makeTarget(primaryEffectId: string): TargetBloodGem {
  return {
    datasetId: "test_dataset",
    acceptedShapes: ["radial"],
    primaryEffectId,
    acceptedPrimaryRanks: [17, 18, 19],
    acceptedCurses: ["stamina_cost_up"],
  };
}

function makeGems(primaryEffectId: string, curseId = "stamina_cost_up"): BloodGem[] {
  return Array.from({ length: 10 }, () => ({
    datasetId: "test_dataset",
    shapeId: "radial",
    primaryEffectId,
    primaryValueRank: 18,
    secondaryEffectId: null,
    secondaryValueRank: null,
    curseId,
  }));
}

describe("hooks/useSimulationHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("Target未設定(null)のときはrecordBatchを呼んでも何も保存しない", () => {
    const { result } = renderHook(() => useSimulationHistory(DATASET, null, null));
    act(() => {
      result.current.recordBatch(makeGems("physical"));
    });
    expect(listSessions()).toHaveLength(0);
    expect(result.current.sessionTotalDraws).toBe(0);
  });

  it("同一Targetでの複数回の10連は同じsessionに積算される", () => {
    const target = makeTarget("physical");
    const { result } = renderHook(() => useSimulationHistory(DATASET, target, 0.1));

    act(() => {
      result.current.recordBatch(makeGems("physical")); // 全件match
    });
    act(() => {
      result.current.recordBatch(makeGems("physical"));
    });

    const sessions = listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].total_draws).toBe(20);
    expect(sessions[0].match_count).toBe(20);
    expect(result.current.sessionTotalDraws).toBe(20);
    expect(result.current.sessionMatchCount).toBe(20);
  });

  it("Targetが変わると次のrecordBatchで新しいsessionが作られる(既存sessionは変更しない)", () => {
    const targetA = makeTarget("physical");
    const { result, rerender } = renderHook(({ target }) => useSimulationHistory(DATASET, target, 0.1), {
      initialProps: { target: targetA },
    });

    act(() => {
      result.current.recordBatch(makeGems("physical"));
    });
    expect(listSessions()).toHaveLength(1);

    const targetB = makeTarget("arcane");
    rerender({ target: targetB });

    act(() => {
      result.current.recordBatch(makeGems("arcane"));
    });

    const sessions = listSessions();
    expect(sessions).toHaveLength(2);
    // 最初のsessionは変更されず10のまま
    const original = sessions.find((s) => s.target.primary_effect_id === "physical");
    expect(original?.total_draws).toBe(10);
    const created = sessions.find((s) => s.target.primary_effect_id === "arcane");
    expect(created?.total_draws).toBe(10);
  });

  it("clearHistoryで全履歴が消え、表示用stateもリセットされる", () => {
    const target = makeTarget("physical");
    const { result } = renderHook(() => useSimulationHistory(DATASET, target, 0.1));

    act(() => {
      result.current.recordBatch(makeGems("physical"));
    });
    expect(listSessions()).toHaveLength(1);

    act(() => {
      result.current.clearHistory();
    });
    expect(listSessions()).toHaveLength(0);
    expect(result.current.sessionTotalDraws).toBe(0);
  });
});
