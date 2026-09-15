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
import { useResearchSession, REVEAL_ITEM_DELAY_MS, AUTO_INTERVAL_MIN_MS, AUTO_INTERVAL_MAX_MS, RESUME_NOTICE_AUTO_DISMISS_MS } from "./useResearchSession";

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

  it("途中終了(giveUp)は必ず事後アンケート→退出理由を経由してから確定する(即結果画面へは飛ばない)", () => {
    const fake = createFakeCoreSession(null);
    mocks.sessionFactory = () => fake;
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 2);
    });

    // giveUpを押した直後はまだ結果画面に飛ばず、事後アンケートへ進む(Coreのgiveup()もまだ呼ばれない)
    act(() => {
      result.current.giveUp();
    });
    expect(result.current.uiPhase).toBe("awaiting_survey");
    expect(fake.phase).toBe("running"); // Core内部はまだgiveUp()されていない
    expect(result.current.finalRecord).toBeNull();

    // アンケート回答 → 退出理由待ちへ
    act(() => {
      result.current.submitSurvey({ tediousnessScore: 4, painIfRepeatedScore: 2, sensorScore: 1 });
    });
    expect(result.current.uiPhase).toBe("awaiting_exit_reason");
    expect(result.current.finalRecord).toBeNull(); // まだ理論確率も結果も出さない

    // 退出理由回答 → ここで初めて確定する
    act(() => {
      result.current.submitExitReason("tedious");
    });

    expect(result.current.uiPhase).toBe("revealed");
    expect(result.current.finalRecord?.success).toBe(false);
    expect(result.current.finalRecord?.censored).toBe(true);
    expect(result.current.finalRecord?.roll_count).toBeNull();
    expect(result.current.finalRecord?.cutoff_draws).toBe(0);
    // giveUp時もアンケートで集めた回答がそのまま保存される(Coreのsummary.surveyには依存しない)
    expect(result.current.finalRecord?.tedious_score).toBe(4);
    expect(result.current.finalRecord?.sensor_score).toBe(1);
    expect(result.current.finalRecord?.exit_reason).toBe("tedious");

    const saved = listExperiments();
    expect(saved).toHaveLength(1);
    expect(saved[0].censored).toBe(true);
    expect(saved[0].exit_reason).toBe("tedious");
  });

  it("manual/autoは実験開始時にランダムへ割り当てられ、参加者は選べない", () => {
    mocks.sessionFactory = () => createFakeCoreSession(null);
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
    });

    expect(["manual", "auto"]).toContain(result.current.drawAdvanceMode);
  });

  it("auto条件では一時停止/再開の回数と時間が記録され、auto_interval_msは3000〜5000msの範囲で保存される", async () => {
    const fake = createFakeCoreSession(1);
    mocks.sessionFactory = () => fake;
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9); // 0.5以上 -> "auto"
    const { result } = renderHook(() => useResearchSession());

    act(() => {
      result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
    });
    randomSpy.mockRestore();

    expect(result.current.drawAdvanceMode).toBe("auto");

    act(() => {
      result.current.pauseAuto();
    });
    expect(result.current.isAutoPaused).toBe(true);
    act(() => {
      result.current.resumeAuto();
    });
    expect(result.current.isAutoPaused).toBe(false);

    await act(async () => {
      await result.current.revealBatch();
    });
    act(() => {
      result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1 });
    });

    expect(result.current.finalRecord?.draw_advance_mode).toBe("auto");
    expect(result.current.finalRecord?.auto_interval_ms).toBeGreaterThanOrEqual(AUTO_INTERVAL_MIN_MS);
    expect(result.current.finalRecord?.auto_interval_ms).toBeLessThanOrEqual(AUTO_INTERVAL_MAX_MS);
    expect(result.current.finalRecord?.pause_count).toBe(1);
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
      draw_advance_mode: "manual",
      auto_interval_ms: null,
    });

    const { result } = renderHook(() => useResearchSession());
    expect(result.current.resumeSnapshot?.experiment_id).toBe("resumed-exp");
  });

  // 以下、実タイマーで検証する(vi.useFakeTimers()はReactのスケジューラと相性が悪く、
  // このhookのような「非同期ループ+複数回のReact state更新」を含む処理と組み合わせると
  // act()のフラッシュが止まってテストがハングすることがあったため、あえて避けている)。
  // REVEAL_ITEM_DELAY_MS(400ms)・AUTO_INTERVAL_MIN_MS(3000ms)を使うため、実時間がかかる。
  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // auto条件の待機(useEffect駆動の1秒ごとの再スケジュール)は、1回の大きなact()の中で
  // 待ち続けるだけだとReactのeffect再実行が正しく積み重ならないことがあるため、
  // 小刻みにact()の境界を作ってReactに再レンダーの機会を都度与える。
  async function waitInChunks(totalMs: number, chunkMs = 250) {
    let elapsed = 0;
    while (elapsed < totalMs) {
      const step = Math.min(chunkMs, totalMs - elapsed);
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await wait(step);
      });
      elapsed += step;
    }
  }

  describe("順次表示(1件ずつ)とタイミング", () => {
    it(
      "10件が一括表示されず、REVEAL_ITEM_DELAY_MSごとに1件ずつ表示される",
      async () => {
        const fake = createFakeCoreSession(null); // 10件中MATCHなし
        mocks.sessionFactory = () => fake;
        const { result } = renderHook(() => useResearchSession());

        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });

        let revealPromise!: Promise<void>;
        act(() => {
          revealPromise = result.current.revealBatch();
        });
        // 開始直後: 1件目だけが表示されている(10件が一度に出ない)
        expect(result.current.currentBatchRevealed).toHaveLength(1);
        expect(result.current.isRevealing).toBe(true);

        // 1件分の間隔が経過した直後でもまだ2件目程度で、10件には達していない
        await act(async () => {
          await wait(REVEAL_ITEM_DELAY_MS + 100);
        });
        expect(result.current.currentBatchRevealed.length).toBeLessThan(10);
        expect(result.current.currentBatchRevealed.length).toBeGreaterThanOrEqual(2);

        await act(async () => {
          await revealPromise;
        });
        expect(result.current.isRevealing).toBe(false);
        expect(result.current.rollCount).toBe(10);
        expect(result.current.currentBatchRevealed).toHaveLength(10);
      },
      10000
    );

    it(
      "表示中はrevealBatchを連打しても二重に処理されない(全件提示完了まで次を開始しない)",
      async () => {
        const fake = createFakeCoreSession(null);
        mocks.sessionFactory = () => fake;
        const { result } = renderHook(() => useResearchSession());

        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });

        let firstCall!: Promise<void>;
        act(() => {
          firstCall = result.current.revealBatch();
          void result.current.revealBatch(); // 連打(表示中の2回目呼び出し。無視されるはず)
        });

        await act(async () => {
          await firstCall;
        });

        // 連打しても、1回分(10件)しか処理されていないこと
        expect(fake.revealNextCallCount).toBe(10);
        expect(result.current.rollCount).toBe(10);
      },
      10000
    );
  });

  describe("auto: 全件表示完了を待ってから固定intervalで次へ進む", () => {
    it(
      "表示完了前には次の10連を開始せず、完了後はauto_interval_ms経過で自動的に開始する",
      async () => {
        const fake = createFakeCoreSession(null); // MATCHなし
        mocks.sessionFactory = () => fake;
        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // mode="auto"(0.5>=0.5), interval=3000+floor(0.5*2001)=4000ms
        const { result } = renderHook(() => useResearchSession());
        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });
        randomSpy.mockRestore();
        expect(result.current.drawAdvanceMode).toBe("auto");
        const intervalMs = result.current.autoRemainingMs;
        expect(intervalMs).toBeGreaterThanOrEqual(AUTO_INTERVAL_MIN_MS);
        expect(intervalMs).toBeLessThanOrEqual(AUTO_INTERVAL_MAX_MS);

        // interval経過前: まだ1件も生成されていない(結果表示完了を待つ前の「次のバッチ」も、
        // そもそも最初のバッチ自体もintervalが明けるまで始まらない)
        await waitInChunks(500);
        expect(fake.revealNextCallCount).toBe(0);

        // intervalが明けた直後: 1件だけ出ていて、10件がまとめて出ていないこと
        await waitInChunks(intervalMs - 500 + 150);
        expect(fake.revealNextCallCount).toBeGreaterThanOrEqual(1);
        expect(fake.revealNextCallCount).toBeLessThan(10);

        // 1バッチ(10件)の表示が完了するまで待つ
        await waitInChunks(REVEAL_ITEM_DELAY_MS * 10);
        expect(fake.revealNextCallCount).toBe(10);
        expect(result.current.isRevealing).toBe(false);
      },
      15000
    );

    it(
      "Target Matchした場合、次のauto実行は予約されない",
      async () => {
        const fake = createFakeCoreSession(2); // 2件目でMATCH
        mocks.sessionFactory = () => fake;
        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // mode="auto", interval=4000ms
        const { result } = renderHook(() => useResearchSession());
        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });
        randomSpy.mockRestore();
        const intervalMs = result.current.autoRemainingMs;

        await waitInChunks(intervalMs + REVEAL_ITEM_DELAY_MS * 4 + 150);
        expect(fake.revealNextCallCount).toBe(2);
        expect(result.current.uiPhase).toBe("awaiting_survey");

        // MATCH後、次のinterval分待ってもauto実行は起きない
        await waitInChunks(intervalMs);
        expect(fake.revealNextCallCount).toBe(2);
      },
      15000
    );
  });

  describe("実験終了(giveUp)時のrace condition対策", () => {
    it(
      "結果を順次表示している最中に終了しても、未表示分は表示されず、それ以降試行回数も増えない",
      async () => {
        const fake = createFakeCoreSession(null); // MATCHなし(10件全部外れ想定)
        mocks.sessionFactory = () => fake;
        const { result } = renderHook(() => useResearchSession());
        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });

        act(() => {
          void result.current.revealBatch();
        });
        // 数件表示させたところで終了する
        await act(async () => {
          await wait(REVEAL_ITEM_DELAY_MS * 2 + 100);
        });
        const revealedAtGiveUp = result.current.currentBatchRevealed.length;
        expect(revealedAtGiveUp).toBeGreaterThan(0);
        expect(revealedAtGiveUp).toBeLessThan(10);

        act(() => {
          result.current.giveUp();
        });

        // 終了後、10件ぶんの時間が経っても続きは追加されない
        await act(async () => {
          await wait(REVEAL_ITEM_DELAY_MS * 10);
        });
        expect(result.current.currentBatchRevealed).toHaveLength(revealedAtGiveUp);
        expect(result.current.rollCount).toBe(revealedAtGiveUp);
        expect(fake.revealNextCallCount).toBe(revealedAtGiveUp);

        // その後アンケート・退出理由を経てcutoff_drawsが正確であることを確認
        act(() => {
          result.current.submitSurvey({ tediousnessScore: 3, painIfRepeatedScore: 3, sensorScore: 3 });
        });
        act(() => {
          result.current.submitExitReason("tedious");
        });
        expect(result.current.finalRecord?.cutoff_draws).toBe(revealedAtGiveUp);
        expect(result.current.finalRecord?.roll_count).toBeNull();
      },
      10000
    );

    it(
      "auto条件で、次の10連待ち中に終了すると、以降auto実行は一切走らない",
      async () => {
        const fake = createFakeCoreSession(null);
        mocks.sessionFactory = () => fake;
        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // mode="auto", interval=4000ms
        const { result } = renderHook(() => useResearchSession());
        act(() => {
          result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
        });
        randomSpy.mockRestore();
        const intervalMs = result.current.autoRemainingMs;

        // 1バッチ分完了させる(次のバッチ待ちの状態にする)
        await waitInChunks(intervalMs + REVEAL_ITEM_DELAY_MS * 10 + 300);
        expect(fake.revealNextCallCount).toBe(10);
        expect(result.current.isRevealing).toBe(false);

        // 次のバッチ待ち(カウントダウン中)に終了する
        act(() => {
          result.current.giveUp();
        });

        // 終了後、intervalぶん過ぎても新しいバッチは一切始まらない
        await waitInChunks(intervalMs);
        expect(fake.revealNextCallCount).toBe(10);
      },
      20000
    );
  });

  describe("「前回の実験を再開しました」通知の自動非表示", () => {
    it(
      "表示開始からRESUME_NOTICE_AUTO_DISMISS_MS後に自動的に消える",
      async () => {
      saveActiveExperiment({
        experiment_id: "resumed-exp-2",
        participant_id: "participant-1",
        started_at: "2026-01-01T00:00:00.000Z",
        // resumeExperiment()はCoreの実際のGemDatasetsからdataset_idを引くため、
        // (createResearchModeSessionはmock済みでも)実在するdataset_idを使う必要がある。
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
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
        draw_advance_mode: "manual",
        auto_interval_ms: null,
      });
      mocks.sessionFactory = () => createFakeCoreSession(null);
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.resumeExperiment();
      });
      expect(result.current.resumedProgressReset).toBe(true);

      await act(async () => {
        await wait(RESUME_NOTICE_AUTO_DISMISS_MS - 500);
      });
      expect(result.current.resumedProgressReset).toBe(true); // まだ消えていない

      await act(async () => {
        await wait(700);
      });
      expect(result.current.resumedProgressReset).toBe(false); // 自動的に消えた
      },
      10000
    );

    it("実験を終了すると、通知フラグも消える", () => {
      saveActiveExperiment({
        experiment_id: "resumed-exp-3",
        participant_id: "participant-1",
        started_at: "2026-01-01T00:00:00.000Z",
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
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
        draw_advance_mode: "manual",
        auto_interval_ms: null,
      });
      mocks.sessionFactory = () => createFakeCoreSession(null);
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.resumeExperiment();
      });
      expect(result.current.resumedProgressReset).toBe(true);

      act(() => {
        result.current.giveUp();
      });
      act(() => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1 });
      });
      act(() => {
        result.current.submitExitReason("other");
      });

      expect(result.current.resumedProgressReset).toBe(false);
    });
  });
});
