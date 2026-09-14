import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BloodGem, ProbabilityResult, ResearchModeRevealResult, ResearchModeSummary, TargetBloodGem } from "motsuyoku-sensor-core";
import { listExperiments, saveActiveExperiment } from "../storage/researchHistory";

// useResearchSessionは「Experiment Flow」自体(roll_countの積算・MATCH停止・survey gating)を
// Core(researchModeState.js、既にCore側の35テストで検証済み)にそのまま委ねている。
// ここではCoreの数値計算を再検証するのではなく、Coreが返す値をhookが正しく
// (a) UI stateへ配線しているか、(b) localStorageへ正しく保存しているかを検証する。
// そのためcreateResearchModeSessionのみを差し替え可能にする。
const mocks = vi.hoisted(() => ({
  sessionFactory: null as null | (() => unknown),
}));

vi.mock("motsuyoku-sensor-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motsuyoku-sensor-core")>();
  return {
    ...actual,
    createResearchModeSession: vi.fn(() => mocks.sessionFactory!()),
  };
});

// eslint-disable-next-line import/first
import { useResearchSession } from "./useResearchSession";

function makeGem(): BloodGem {
  return {
    datasetId: "test_dataset",
    shapeId: "radial",
    primaryEffectId: "physical",
    primaryValueRank: 18,
    secondaryEffectId: null,
    secondaryValueRank: null,
    curseId: "stamina_cost_up",
  };
}

// Core(researchModeState.js)と同じ契約を持つ、テスト用の決定的なフェイクセッション。
// matchAtRollCountに達した時点でmatched:trueを返しphaseをawaiting_surveyへ進める。
function createFakeCoreSession(matchAtRollCount: number | null) {
  let phase: ResearchModeSummary["phase"] = "setup";
  let rollCount = 0;
  let matchedAt: number | null = null;
  let censored = false;
  let survey: ResearchModeSummary["survey"] = null;
  const startedAt = 1000;
  let finishedAt: number | null = null;
  let revealNextCallCount = 0;

  return {
    start() {
      phase = "running";
    },
    revealNext(): ResearchModeRevealResult {
      revealNextCallCount += 1;
      rollCount += 1;
      const matched = matchAtRollCount !== null && rollCount === matchAtRollCount;
      if (matched) {
        matchedAt = rollCount;
        phase = "awaiting_survey";
      }
      return { gem: makeGem(), rollCount, matched };
    },
    giveUp() {
      censored = true;
      finishedAt = startedAt + rollCount * 10;
      phase = "revealed";
    },
    submitSurvey(answers: NonNullable<ResearchModeSummary["survey"]>) {
      survey = answers;
      finishedAt = startedAt + rollCount * 10;
      phase = "revealed";
    },
    getTheoreticalProbability(): ProbabilityResult {
      return {
        p: 0.1258,
        approxOneInN: 7.95,
        breakdown: {
          shape: { raw: 1, effective: 1 },
          primaryEffect: { raw: 1, effective: 1 },
          primaryRank: { raw: 1, effective: 1 },
          secondaryEffect: { raw: 1, effective: 1 },
          secondaryRank: { raw: 1, effective: 1 },
          curse: { raw: 1, effective: 1 },
        },
      };
    },
    getSummary(): ResearchModeSummary {
      return {
        datasetId: "test_dataset",
        target: {} as TargetBloodGem,
        desireScore: 3,
        phase,
        rollCount,
        matched: matchedAt !== null,
        matchedAt,
        censored,
        survey,
        startedAt,
        finishedAt,
      };
    },
    get phase() {
      return phase;
    },
    get revealNextCallCount() {
      return revealNextCallCount;
    },
  };
}

const TEST_DATASET = {
  datasetId: "test_dataset",
  enemy: { enemyId: "merciless_watchers", displayName: "3デブ", secondarySlot: "none", allowDuplicateSecondary: false },
  dataVersion: "vTest",
} as any;

const TEST_TARGET: TargetBloodGem = {
  datasetId: "test_dataset",
  acceptedShapes: ["radial"],
  primaryEffectId: "physical",
  acceptedPrimaryRanks: [18],
  acceptedCurses: ["stamina_cost_up"],
};

describe("hooks/useResearchSession", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.sessionFactory = null;
  });

  it("startExperimentでrunning状態になり、実験中は理論確率が一切見えない(finalProbability=null)", () => {
    mocks.sessionFactory = () => createFakeCoreSession(null);
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
    });

    expect(result.current.uiPhase).toBe("running");
    expect(result.current.finalProbability).toBeNull();
    expect(result.current.finalRecord).toBeNull();
  });

  it("最初のMATCHで正確なroll_countのところで止まり、以降は開示しない(事後アンケートへ)", async () => {
    const fake = createFakeCoreSession(4);
    mocks.sessionFactory = () => fake;
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
    });

    await act(async () => {
      await result.current.revealBatch();
    });

    expect(result.current.rollCount).toBe(4);
    expect(fake.revealNextCallCount).toBe(4); // 5件目以降は呼ばれない(残りは参加者に見せない)
    expect(result.current.uiPhase).toBe("awaiting_survey");
    expect(result.current.finalProbability).toBeNull(); // アンケート前はまだ非表示
  });

  it("survey完了後に初めて理論確率が公開され、研究履歴へ保存される", async () => {
    const fake = createFakeCoreSession(2);
    mocks.sessionFactory = () => fake;
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 4);
    });
    await act(async () => {
      await result.current.revealBatch();
    });

    act(() => {
      result.current.submitSurvey({ tediousnessScore: 3, painIfRepeatedScore: 2, sensorScore: 5 });
    });

    expect(result.current.uiPhase).toBe("revealed");
    expect(result.current.finalProbability?.p).toBeCloseTo(0.1258);
    expect(result.current.finalRecord?.success).toBe(true);
    expect(result.current.finalRecord?.roll_count).toBe(2);
    expect(result.current.finalRecord?.tedious_score).toBe(3);
    expect(result.current.finalRecord?.sensor_score).toBe(5);
    expect(result.current.finalRecord?.submission_status).toBe("local_only");

    const saved = listExperiments();
    expect(saved).toHaveLength(1);
    expect(saved[0].success).toBe(true);

    // activeExperimentは完了時にクリアされる
    expect(localStorage.getItem("motsuyoku_sensor_active_experiment_v1")).toBeNull();
  });

  it("途中終了(giveUp)はsuccess=false, censored=true, roll_count=nullで保存される", () => {
    mocks.sessionFactory = () => createFakeCoreSession(null);
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 2);
    });
    act(() => {
      result.current.giveUp();
    });

    expect(result.current.uiPhase).toBe("revealed");
    expect(result.current.finalRecord?.success).toBe(false);
    expect(result.current.finalRecord?.censored).toBe(true);
    expect(result.current.finalRecord?.roll_count).toBeNull();
    expect(result.current.finalRecord?.cutoff_draws).toBe(0);
    // giveUpはCoreの設計上surveyを経由しないため、survey系スコアはnullのまま
    expect(result.current.finalRecord?.tedious_score).toBeNull();

    const saved = listExperiments();
    expect(saved).toHaveLength(1);
    expect(saved[0].censored).toBe(true);
  });

  it("reload時にactive experimentが存在すれば、resumeSnapshotとして拾える", () => {
    saveActiveExperiment({
      experiment_id: "resumed-exp",
      participant_id: "participant-1",
      started_at: "2026-01-01T00:00:00.000Z",
      dataset_id: "test_dataset",
      enemy_id: "merciless_watchers",
      enemy_display_name: "3デブ",
      target: {
        shape: ["radial"],
        primary_effect_id: "physical",
        primary_allowed_ranks: [18],
        secondary_effect_id: null,
        secondary_allowed_ranks: null,
        accepted_curse_ids: ["stamina_cost_up"],
      },
      desire_score: 3,
    });

    const { result } = renderHook(() => useResearchSession());
    expect(result.current.resumeSnapshot?.experiment_id).toBe("resumed-exp");
  });
});
