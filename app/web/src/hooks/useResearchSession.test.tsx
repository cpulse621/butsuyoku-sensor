import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BloodGem, ProbabilityResult, ResearchModeRevealResult, ResearchModeSummary, TargetBloodGem } from "motsuyoku-sensor-core";
import { listExperiments, saveActiveExperiment, loadActiveExperiment } from "../storage/researchHistory";
import { appendDraw, listDrawsForExperiment, DRAW_DETAIL_SCHEMA_VERSION } from "../storage/researchDrawsDb";

// useResearchSessionは「Experiment Flow」自体(roll_countの積算・MATCH停止・survey gating)を
// Core(researchModeState.js、既にCore側の35テストで検証済み)にそのまま委ねている。
// ここではCoreの数値計算を再検証するのではなく、Coreが返す値をhookが正しく
// (a) UI stateへ配線しているか、(b) localStorageへ正しく保存しているかを検証する。
// そのためcreateResearchModeSessionのみを差し替え可能にする。
const mocks = vi.hoisted(() => ({
  sessionFactory: null as null | (() => unknown),
  // 本番のINITIAL_COIN(100,000)のままだとTEST_DATASET(1draw=100coin)でexhaustionまで
  // 1000回のrevealNextが必要になり、実タイマー(REVEAL_ITEM_DELAY_MS=400ms)ベースのテストでは
  // 非現実的に遅くなる。coin関連テストだけこの値を小さく差し替える。
  initialCoin: 100000,
  // appendDraw()を指定回数目(1-indexed)だけ失敗させる(指示1節E項の検証用)。nullなら常に成功する。
  appendDrawFailOnCallNumber: null as number | null,
  appendDrawCallCount: 0,
  // getLastDrawForExperiment()を強制的に失敗させる(指示1節D項: IndexedDB read failureの検証用)。
  getLastDrawShouldFail: false,
}));

vi.mock("motsuyoku-sensor-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motsuyoku-sensor-core")>();
  return {
    ...actual,
    createResearchModeSession: vi.fn(() => mocks.sessionFactory!()),
  };
});

vi.mock("../lib/coinCost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/coinCost")>();
  return {
    ...actual,
    get INITIAL_COIN() {
      return mocks.initialCoin;
    },
  };
});

vi.mock("../storage/researchDrawsDb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/researchDrawsDb")>();
  return {
    ...actual,
    appendDraw: async (record: Parameters<typeof actual.appendDraw>[0]) => {
      mocks.appendDrawCallCount += 1;
      if (mocks.appendDrawFailOnCallNumber !== null && mocks.appendDrawCallCount === mocks.appendDrawFailOnCallNumber) {
        throw new Error("indexeddb write failed (test)");
      }
      return actual.appendDraw(record);
    },
    getLastDrawForExperiment: async (experimentId: string) => {
      if (mocks.getLastDrawShouldFail) throw new Error("indexeddb read failed (test)");
      return actual.getLastDrawForExperiment(experimentId);
    },
  };
});

// eslint-disable-next-line import/first
import { useResearchSession, REVEAL_ITEM_DELAY_MS, AUTO_INTERVAL_MIN_MS, AUTO_INTERVAL_MAX_MS, RESUME_NOTICE_AUTO_DISMISS_MS } from "./useResearchSession";
// eslint-disable-next-line import/first
import { COIN_COST_MODEL_VERSION } from "../lib/coinCost";

// datasetIdはデフォルトでTEST_DATASET(下記)に合わせた値だが、resumeテストのように
// 実在するdataset(WatchersDataset等)を使う場合は明示的に合わせる必要がある
// (computeGemProbabilityがtarget.datasetIdとdataset.datasetIdの一致を要求するため)。
function makeGem(datasetId = "test_dataset"): BloodGem {
  return {
    datasetId,
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
function createFakeCoreSession(matchAtRollCount: number | null, datasetId = "test_dataset") {
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
      return { gem: makeGem(datasetId), rollCount, matched };
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

// revealBatch()はcreateResearchModeSession()(モック済み)経由の抽選とは別に、
// computeGemProbability()(motsuyoku-sensor-coreの実物、モックしていない)を実際に呼ぶため、
// このfixtureはcomputeProbability内部が参照するpool構造を(最小限だが)本物同様に持つ必要がある。
// makeGem()が返す固定gem(radial/physical/R18/stamina_cost_up)がちょうど「唯一の組み合わせ」に
// なるようにして、p=1で一意に確定させている。
const TEST_DATASET = {
  datasetId: "test_dataset",
  enemy: { enemyId: "merciless_watchers", displayName: "3デブ", secondarySlot: "none", allowDuplicateSecondary: false },
  dataVersion: "vTest",
  shapeTable: { shapeTableId: "s", entries: [{ shapeId: "radial", weight: 1 }] },
  effectPools: { primary: { effectPoolId: "p", nativeEntries: [{ effectId: "physical", weight: 1 }], ooeEntries: [] } },
  // 2件以上の呪いを用意する(1通りしかないとentropy=0になり、coinコスト計算(H(dataset)で割る)が
  // ゼロ除算エラーになるため)。makeGem()が返す固定gem(curseId: stamina_cost_up)は
  // 引き続きp=0.5(2択のうち1つ)として有効な組み合わせのまま。
  cursePool: {
    cursePoolId: "c",
    entries: [
      { curseId: "stamina_cost_up", weight: 1 },
      { curseId: "hp_deplete", weight: 1 },
    ],
  },
  conflictGroups: { conflictGroupSetId: "cg", groups: [] },
  primaryRankTiers: [18],
  secondaryRankTiers: null,
  rankTierDistribution: { primary: [1], secondary: null },
  effectValueBindings: [],
  valueSeriesById: {},
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
    mocks.initialCoin = 100000;
    mocks.appendDrawFailOnCallNumber = null;
    mocks.appendDrawCallCount = 0;
    mocks.getLastDrawShouldFail = false;
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

    await act(async () => {
      result.current.submitSurvey({ tediousnessScore: 3, painIfRepeatedScore: 2, sensorScore: 5, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
      await wait(50); // finalize()は非同期(ResearchDrawsの実カウントをawaitする)ため、確定を待つ
    });

    expect(result.current.uiPhase).toBe("revealed");
    expect(result.current.finalProbability?.p).toBeCloseTo(0.1258);
    expect(result.current.finalRecord?.success).toBe(true);
    expect(result.current.finalRecord?.roll_count).toBe(2);
    expect(result.current.finalRecord?.tedious_score).toBe(3);
    expect(result.current.finalRecord?.sensor_score).toBe(5);
    expect(result.current.finalRecord?.effort_reward_fit_score).toBe(3);
    expect(result.current.finalRecord?.perceived_expected_draws).toBe(100);
    expect(result.current.finalRecord?.termination_reason).toBe("target_match");
    expect(result.current.finalRecord?.submission_status).toBe("local_only");

    const saved = listExperiments();
    expect(saved).toHaveLength(1);
    expect(saved[0].success).toBe(true);

    // activeExperimentは完了時にクリアされる
    expect(localStorage.getItem("motsuyoku_sensor_active_experiment_v1")).toBeNull();
  });

  it("途中終了(giveUp)は必ず事後アンケート→退出理由を経由してから確定する(即結果画面へは飛ばない)", async () => {
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
      result.current.submitSurvey({ tediousnessScore: 4, painIfRepeatedScore: 2, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
    });
    expect(result.current.uiPhase).toBe("awaiting_exit_reason");
    expect(result.current.finalRecord).toBeNull(); // まだ理論確率も結果も出さない

    // 退出理由回答 → ここで初めて確定する
    await act(async () => {
      result.current.submitExitReason("tedious");
      await wait(50); // finalize()は非同期(ResearchDrawsの実カウントをawaitする)ため、確定を待つ
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
    expect(result.current.finalRecord?.termination_reason).toBe("participant_giveup");

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
    await act(async () => {
      result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
      await wait(50);
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
      pause_count: 0,
      paused_duration_ms: 0,
      resume_count: 0,
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
        // revealBatch()は各drawごとにappendDraw()(IndexedDB書き込み)の完了をawaitするようになった
        // (指示1節A項: fire-and-forgetにしない)ため、1件目の反映には短い非同期待ちが必要。
        await act(async () => {
          await wait(50);
        });
        // 1件目だけが表示されている(10件が一度に出ない)
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
          result.current.submitSurvey({ tediousnessScore: 3, painIfRepeatedScore: 3, sensorScore: 3, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        });
        await act(async () => {
          result.current.submitExitReason("tedious");
          await wait(50);
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
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
      });
      mocks.sessionFactory = () => createFakeCoreSession(null);
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
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

    it("実験を終了すると、通知フラグも消える", async () => {
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
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
      });
      mocks.sessionFactory = () => createFakeCoreSession(null);
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.resumedProgressReset).toBe(true);

      act(() => {
        result.current.giveUp();
      });
      act(() => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
      });
      await act(async () => {
        result.current.submitExitReason("other");
        await wait(50);
      });

      expect(result.current.resumedProgressReset).toBe(false);
    });
  });

  describe("ResearchDraws(IndexedDB)への1 visible draw = 1 recordの永続化", () => {
    it("表示されたdrawだけがResearchDrawsへ保存され、Target Match後の未表示分は保存されない", async () => {
      const fake = createFakeCoreSession(3); // 3件目でMATCH
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
      });
      await act(async () => {
        await result.current.revealBatch();
      });

      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });
      const experimentId = result.current.finalRecord!.experiment_id;

      const rows = await listDrawsForExperiment(experimentId);
      expect(rows).toHaveLength(3); // #1〜#3のみ(MATCHした#3自身は含むが、#4以降は生成されていない)
      expect(rows.map((r) => r.draw_index)).toEqual([1, 2, 3]);
      expect(rows[2].target_match).toBe(true);
      expect(rows[0].target_match).toBe(false);
      expect(rows[0].draw_detail_schema_version).toBe(DRAW_DETAIL_SCHEMA_VERSION);
    });

    it("draw_detail_count(ローカル記録の期待件数)は送信前にResearchDrawsの実カウントで確定し、後から更新されない", async () => {
      const fake = createFakeCoreSession(2);
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
      });
      await act(async () => {
        await result.current.revealBatch();
      });
      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50); // finalize()がResearchDrawsの実カウントをawaitしてから記録を確定するのを待つ
      });

      // finalize()の時点でdraw_detail_countは既に確定している(後追いのAPI更新は存在しない)。
      expect(result.current.finalRecord?.draw_detail_count).toBe(2);
      const [saved] = listExperiments();
      expect(saved.draw_detail_count).toBe(2);
    });
  });

  describe("resume(案A): roll_offsetをResearchDraws(正本)から復元する", () => {
    it("reload前に3件保存済みなら、resume後の最初のMATCHでroll_countが3+相対値になる(0に戻らない)", async () => {
      const experimentId = "resume-offset-exp";
      // reload前に既に3件のvisible drawが記録されていた状況を再現する。
      await appendDraw({
        experiment_id: experimentId,
        draw_index: 1,
        batch_index: 1,
        active_elapsed_ms: 400,
        wall_elapsed_ms: 400,
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
        shape_id: "radial",
        primary_effect_id: "physical",
        primary_value_rank: 18,
        secondary_effect_id: null,
        secondary_value_rank: null,
        curse_id: "stamina_cost_up",
        target_match: false,
        gem_probability_exact: 0.05,
        gem_surprisal_bits: 4.32,
        coin_cost: null,
        coin_remaining_after_draw: null,
        coin_cost_model_version: null,
        draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
      });
      await appendDraw({
        experiment_id: experimentId,
        draw_index: 2,
        batch_index: 1,
        active_elapsed_ms: 800,
        wall_elapsed_ms: 800,
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
        shape_id: "radial",
        primary_effect_id: "physical",
        primary_value_rank: 18,
        secondary_effect_id: null,
        secondary_value_rank: null,
        curse_id: "stamina_cost_up",
        target_match: false,
        gem_probability_exact: 0.05,
        gem_surprisal_bits: 4.32,
        coin_cost: null,
        coin_remaining_after_draw: null,
        coin_cost_model_version: null,
        draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
      });
      await appendDraw({
        experiment_id: experimentId,
        draw_index: 3,
        batch_index: 1,
        active_elapsed_ms: 1200,
        wall_elapsed_ms: 1200,
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
        shape_id: "radial",
        primary_effect_id: "physical",
        primary_value_rank: 18,
        secondary_effect_id: null,
        secondary_value_rank: null,
        curse_id: "stamina_cost_up",
        target_match: false,
        gem_probability_exact: 0.05,
        gem_surprisal_bits: 4.32,
        coin_cost: null,
        coin_remaining_after_draw: null,
        coin_cost_model_version: null,
        draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
      });

      saveActiveExperiment({
        experiment_id: experimentId,
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
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
      });

      // 新しいCoreセッション内の相対2件目でMATCH。実在するWatchersDatasetを使うため、
      // fake gemのdatasetIdもそれに合わせる(computeGemProbabilityがdatasetId一致を要求するため)。
      const fake = createFakeCoreSession(2, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(3); // resume直後、表示上のroll_countも3から始まる

      await act(async () => {
        await result.current.revealBatch();
      });
      // 絶対roll_count = 前回までの3件 + 今回セッションの相対2件目 = 5
      expect(result.current.rollCount).toBe(5);
      expect(result.current.uiPhase).toBe("awaiting_survey");

      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });
      expect(result.current.finalRecord?.roll_count).toBe(5);
      expect(result.current.finalRecord?.resume_count).toBe(1);

      const rows = await listDrawsForExperiment(experimentId);
      expect(rows.map((r) => r.draw_index)).toEqual([1, 2, 3, 4, 5]); // resume前の3件+今回の2件がすべて揃う
    });
  });

  describe("target_label_snapshot: TargetがLOCKされる実験開始時点で固定する", () => {
    it("実験開始後にdataset側の値が更新されても、finalize時点のsnapshotは開始時点の値のまま変化しない", async () => {
      const mutableDataset = {
        ...TEST_DATASET,
        effectValueBindings: [{ slot: "primary", effectId: "physical", valueSeriesId: "vs1", unit: "percent" }],
        valueSeriesById: { vs1: { valueSeriesId: "vs1", valuesByRank: { 18: { value: 20, verificationStatus: "confirmed" } } } },
      };
      const fake = createFakeCoreSession(1);
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(mutableDataset, TEST_TARGET, 5);
      });

      // 実験開始「後」にdataset側のValueSeriesが更新された状況を模擬する(deploy更新等)。
      mutableDataset.valueSeriesById.vs1.valuesByRank[18].value = 999;

      await act(async () => {
        await result.current.revealBatch();
      });
      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });

      // finalize()がここで再計算していれば999が入ってしまうはずだが、実験開始時点の20のまま。
      expect(result.current.finalRecord?.target_label_snapshot.primary_allowed_values).toBe("20");
    });

    it("resume後もsnapshotは(現在のdatasetから再計算せず)実験開始時点にlocalStorageへ保存された値をそのまま引き継ぐ", async () => {
      const staleLookingSnapshot = {
        primary_label: "開始時点のラベル",
        primary_allowed_values: "12.3",
        secondary_label: "",
        secondary_allowed_values: "",
        accepted_curse_labels: "開始時点の呪いラベル",
      };
      saveActiveExperiment({
        experiment_id: "resume-snapshot-exp",
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
        target_label_snapshot: staleLookingSnapshot,
        desire_score: 3,
        draw_advance_mode: "manual",
        auto_interval_ms: null,
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
      });

      const fake = createFakeCoreSession(1, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      await act(async () => {
        await result.current.revealBatch();
      });
      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });

      // 実際のWatchersDatasetから再計算していれば別の値になるはずだが、保存済みsnapshotのまま。
      expect(result.current.finalRecord?.target_label_snapshot).toEqual(staleLookingSnapshot);
    });
  });

  describe("coin(有限resource/cost体験)のproduction配線", () => {
    it("visible drawごとにcoinが消費され、ResearchDrawsへcoin_cost/coin_remaining_after_draw/coin_cost_model_versionが記録される", async () => {
      const fake = createFakeCoreSession(3); // 3件目でMATCH
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
      });
      expect(result.current.coinRemaining).toBe(100000);
      expect(result.current.coinInitial).toBe(100000);

      await act(async () => {
        await result.current.revealBatch();
      });
      // TEST_DATASET+makeGem()固定の組み合わせはp=0.5(呪い2択のうち1つ)・H=1bitのため、
      // 1drawあたりcost=round(100*1/1)=100になる。3件表示されたので300消費されているはず。
      expect(result.current.coinRemaining).toBe(100000 - 300);
      expect(result.current.coinUsed).toBe(300);

      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });
      expect(result.current.finalRecord?.coin_initial).toBe(100000);
      expect(result.current.finalRecord?.coin_remaining).toBe(100000 - 300);
      expect(result.current.finalRecord?.coin_used).toBe(300);

      const rows = await listDrawsForExperiment(result.current.finalRecord!.experiment_id);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.coin_cost)).toEqual([100, 100, 100]);
      expect(rows.map((r) => r.coin_remaining_after_draw)).toEqual([100000 - 100, 100000 - 200, 100000 - 300]);
      for (const row of rows) {
        expect(row.coin_cost_model_version).toBe(COIN_COST_MODEL_VERSION);
        expect(row.gem_probability_exact).toBeGreaterThan(0);
        expect(row.gem_surprisal_bits).toBeGreaterThan(0);
      }
    });

    it("coin<=0かつTarget未達なら、事後アンケート後に直接finalizeされ(退出理由は挟まない)termination_reason=coin_exhaustedとなり、participant_giveupとは区別される", async () => {
      mocks.initialCoin = 150; // 1draw=100coinなので、2件目で残高-50、exhausted
      const fake = createFakeCoreSession(null); // マッチしない
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
      });

      await act(async () => {
        await result.current.revealBatch();
      });
      expect(result.current.uiPhase).toBe("awaiting_survey");
      expect(result.current.isRetiring).toBe(false); // 参加者が終了ボタンを押したわけではない
      expect(fake.revealNextCallCount).toBe(2); // 2件目でexhausted、以降のdrawは生成されない
      expect(result.current.coinRemaining).toBe(0); // 負の分は表示上clampされる

      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 2, painIfRepeatedScore: 2, sensorScore: 2, effortRewardFitScore: 2, perceivedExpectedDraws: null });
        await wait(50);
      });
      // 退出理由ステップ(awaiting_exit_reason)を経由せず、直接revealedへ確定する。
      expect(result.current.uiPhase).toBe("revealed");
      expect(result.current.finalRecord?.success).toBe(false);
      expect(result.current.finalRecord?.censored).toBe(true);
      expect(result.current.finalRecord?.exit_reason).toBeNull();
      expect(result.current.finalRecord?.termination_reason).toBe("coin_exhausted");
      expect(result.current.finalRecord?.coin_remaining).toBe(0);
      expect(result.current.finalRecord?.coin_used).toBe(200); // 2draws×100

      // Target Matchより後・coin exhaustionより後の未提示drawは保存も課金もされない。
      const rows = await listDrawsForExperiment(result.current.finalRecord!.experiment_id);
      expect(rows).toHaveLength(2);
    });

    it("同一drawでTarget Matchとcoin exhaustionが同時発生した場合はTarget Matchを優先する", async () => {
      mocks.initialCoin = 50; // 1件目のcost(100)で即座に残高が0を下回るほど小さい
      const fake = createFakeCoreSession(1); // 1件目でMATCH
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 5);
      });
      await act(async () => {
        await result.current.revealBatch();
      });
      expect(result.current.uiPhase).toBe("awaiting_survey");

      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });
      expect(result.current.finalRecord?.success).toBe(true);
      expect(result.current.finalRecord?.censored).toBe(false);
      expect(result.current.finalRecord?.termination_reason).toBe("target_match");
    });

    it("resume後もcoinRemainingはResearchDraws最終行のcoin_remaining_after_drawから復元される(0や初期値に戻らない)", async () => {
      const experimentId = "resume-coin-exp";
      await appendDraw({
        experiment_id: experimentId,
        draw_index: 1,
        batch_index: 1,
        active_elapsed_ms: 400,
        wall_elapsed_ms: 400,
        dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
        shape_id: "radial",
        primary_effect_id: "physical",
        primary_value_rank: 18,
        secondary_effect_id: null,
        secondary_value_rank: null,
        curse_id: "stamina_cost_up",
        target_match: false,
        gem_probability_exact: 0.05,
        gem_surprisal_bits: 4.32,
        coin_cost: 432,
        coin_remaining_after_draw: 99568,
        coin_cost_model_version: COIN_COST_MODEL_VERSION,
        draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
      });
      saveActiveExperiment({
        experiment_id: experimentId,
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
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
      });

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.coinRemaining).toBe(99568); // 100,000から0からではなく前回の続きから
    });
  });

  describe("resume: IndexedDB書き込みawait・checkpoint永続化・保存失敗時の挙動(データ完全性修正)", () => {
    function makeSnapshot(experimentId: string, overrides: Record<string, unknown> = {}) {
      return {
        experiment_id: experimentId,
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
        desire_score: 3 as const,
        draw_advance_mode: "manual" as const,
        auto_interval_ms: null,
        pause_count: 0,
        paused_duration_ms: 0,
        resume_count: 0,
        ...overrides,
      };
    }

    async function seedDraws(experimentId: string, count: number, batchIndex = 1) {
      for (let i = 1; i <= count; i++) {
        // eslint-disable-next-line no-await-in-loop
        await appendDraw({
          experiment_id: experimentId,
          draw_index: i,
          batch_index: batchIndex,
          active_elapsed_ms: i * 100,
          wall_elapsed_ms: i * 100,
          dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
          shape_id: "radial",
          primary_effect_id: "physical",
          primary_value_rank: 18,
          secondary_effect_id: null,
          secondary_value_rank: null,
          curse_id: "stamina_cost_up",
          target_match: false,
          gem_probability_exact: 0.05,
          gem_surprisal_bits: 4.32,
          coin_cost: 100,
          coin_remaining_after_draw: 100000 - i * 100,
          coin_cost_model_version: COIN_COST_MODEL_VERSION,
          draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
        });
      }
    }

    it("37draw後にreloadしても、resume後は37から再開する(0に戻らない)", async () => {
      const experimentId = "resume-37-exp";
      await seedDraws(experimentId, 37, 4); // 4バッチ目(31〜37draw目)の途中で中断された想定
      saveActiveExperiment(makeSnapshot(experimentId));

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(37);
    });

    it("10連の途中(7draw目)でreloadしても、resume後は7から再開し、batch_indexも継続する", async () => {
      const experimentId = "resume-mid-batch-exp";
      await seedDraws(experimentId, 7, 1); // 1回目の「次の10連」が7件目で中断された想定
      saveActiveExperiment(makeSnapshot(experimentId));

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(7);

      await act(async () => {
        await result.current.revealBatch();
      });
      const rows = await listDrawsForExperiment(experimentId);
      // resume前の7件+今回の10件=17件。新しいbatch_indexは前回の1から継続して2になる。
      expect(rows).toHaveLength(17);
      expect(rows[7].batch_index).toBe(2);
      expect(rows[16].draw_index).toBe(17);
    });

    it("ResearchDraws(DB)にlastDrawがあれば、snapshotのcheckpointより優先される", async () => {
      const experimentId = "resume-db-priority-exp";
      await seedDraws(experimentId, 5, 1);
      // snapshot側のcheckpointは(古い/不整合な)別の値にしておく。DBが優先されるべき。
      saveActiveExperiment(
        makeSnapshot(experimentId, {
          checkpoint_draw_index: 999,
          checkpoint_batch_index: 99,
          checkpoint_active_elapsed_ms: 999999,
          checkpoint_coin_remaining: 1,
        })
      );

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(5); // 999ではなくDBの5が使われる
      expect(result.current.coinRemaining).toBe(100000 - 500); // DBのcoin_remaining_after_drawが使われる
    });

    it("IndexedDBの読み取りが失敗した場合のみ、snapshotのcheckpointへfallbackする(無言で0扱いにしない)", async () => {
      const experimentId = "resume-read-failure-exp";
      // このexperiment_idにはDB上のdrawを一切用意しない。read自体を強制的に失敗させる。
      mocks.getLastDrawShouldFail = true;
      saveActiveExperiment(
        makeSnapshot(experimentId, {
          checkpoint_draw_index: 15,
          checkpoint_batch_index: 2,
          checkpoint_active_elapsed_ms: 6000,
          checkpoint_coin_remaining: 98500,
        })
      );

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(15); // read失敗時のみsnapshot checkpointへfallback
      expect(result.current.coinRemaining).toBe(98500);
    });

    it("IndexedDBの読み取りに成功して0件だった場合は、snapshot checkpointへfallbackせず0から再開する", async () => {
      const experimentId = "resume-genuinely-empty-exp";
      // DBのreadは成功するが、まだ1件もdrawが記録されていない(実験開始直後にreloadされた想定)。
      // このとき、もしsnapshotに何らかのcheckpointが残っていてもfallbackしてはいけない
      // (readが正常に「0件」と答えているため)。
      saveActiveExperiment(
        makeSnapshot(experimentId, {
          checkpoint_draw_index: 0,
          checkpoint_batch_index: 0,
          checkpoint_active_elapsed_ms: 0,
          checkpoint_coin_remaining: 100000,
        })
      );

      const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      expect(result.current.rollCount).toBe(0);
    });

    it("resume_countはIndexedDB優先・snapshot fallbackのどちらの経路でも1ずつ正しく増える", async () => {
      const experimentId = "resume-count-exp";
      await seedDraws(experimentId, 2, 1);
      saveActiveExperiment(makeSnapshot(experimentId, { resume_count: 3 }));

      const fake = createFakeCoreSession(1, "pthumeru_depth5_standard_watchers_v0_1");
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      await act(async () => {
        await result.current.resumeExperiment();
      });
      await act(async () => {
        await result.current.revealBatch();
      });
      await act(async () => {
        result.current.submitSurvey({ tediousnessScore: 1, painIfRepeatedScore: 1, sensorScore: 1, effortRewardFitScore: 3, perceivedExpectedDraws: 100 });
        await wait(50);
      });
      expect(result.current.finalRecord?.resume_count).toBe(4); // 3 + 1
    });

    it("appendDraw()の完了を待ってからのみcheckpointを進める(fire-and-forgetにしない)", async () => {
      // 1回目のappendDraw呼び出しから失敗させる。このdrawはUI・checkpointのどちらにも反映されない。
      mocks.appendDrawFailOnCallNumber = 1;
      const fake = createFakeCoreSession(null);
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
      });

      await act(async () => {
        await result.current.revealBatch();
      });

      expect(result.current.rollCount).toBe(0); // 保存できなかったdrawはUIにも反映されない
      expect(result.current.currentBatchRevealed).toHaveLength(0);
      expect(result.current.researchDrawsSaveError).not.toBeNull(); // 保存失敗がUIへ表示される

      const rows = await listDrawsForExperiment(result.current.finalRecord?.experiment_id ?? "");
      expect(rows).toHaveLength(0);

      const snapshot = loadActiveExperiment();
      expect(snapshot?.checkpoint_draw_index ?? 0).toBe(0); // checkpointも進んでいない
    });

    it("1バッチ内で3件成功後に4件目が失敗した場合、3件目までは確定保存され、4件目以降は保存されない", async () => {
      mocks.appendDrawFailOnCallNumber = 4;
      const fake = createFakeCoreSession(null); // MATCHなし(10件全部生成しようとする想定)
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
      });
      const experimentId = loadActiveExperiment()!.experiment_id;

      await act(async () => {
        await result.current.revealBatch();
      });

      expect(result.current.rollCount).toBe(3); // 4件目以降は表示・カウントされない
      expect(result.current.currentBatchRevealed).toHaveLength(3);
      expect(result.current.researchDrawsSaveError).not.toBeNull();

      const rows = await listDrawsForExperiment(experimentId);
      expect(rows).toHaveLength(3); // 4件目は保存されていない(欠番のまま)
      expect(rows.map((r) => r.draw_index)).toEqual([1, 2, 3]);

      const snapshot = loadActiveExperiment();
      expect(snapshot?.checkpoint_draw_index).toBe(3); // checkpointも3件目までしか進んでいない
    });
  });

  describe("保存失敗後は同一sessionを続行しない(Coreは巻き戻せないため)", () => {
    it("draw 7のappendDrawが失敗すると、UI rollCount/checkpointは6のまま、そのsessionではそれ以上revealNextされない", async () => {
      mocks.appendDrawFailOnCallNumber = 7;
      const fake = createFakeCoreSession(null); // 通常miss想定(MATCHなし)
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
      });
      const experimentId = loadActiveExperiment()!.experiment_id;

      await act(async () => {
        await result.current.revealBatch();
      });

      expect(result.current.rollCount).toBe(6);
      expect(result.current.currentBatchRevealed).toHaveLength(6);
      expect(result.current.researchDrawsSaveError).toBe(
        "研究データの保存に失敗しました。ページを再読み込みし、「続きから」を選んでください。"
      );
      expect(fake.revealNextCallCount).toBe(7); // 7回目はCore内部では既に呼ばれている(巻き戻せない)

      const rows = await listDrawsForExperiment(experimentId);
      expect(rows).toHaveLength(6);
      const snapshot = loadActiveExperiment();
      expect(snapshot?.checkpoint_draw_index).toBe(6);

      // 同一session内でもう一度「次の10連」を押しても、一切進行しない(persistenceBlockedRef)。
      await act(async () => {
        await result.current.revealBatch();
      });
      expect(fake.revealNextCallCount).toBe(7); // 増えていない
      expect(result.current.rollCount).toBe(6);
      expect(result.current.uiPhase).toBe("running");
    });

    it("失敗したdrawがTarget Matchだった場合でも、surveyへは進まない", async () => {
      // 1件目でMATCHするfakeだが、その1件目のappendDrawを失敗させる。
      mocks.appendDrawFailOnCallNumber = 1;
      const fake = createFakeCoreSession(1);
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
      });

      await act(async () => {
        await result.current.revealBatch();
      });

      // Core内部はAWAITING_SURVEYへ進んでいるはずだが、hook側のuiPhaseはrunningのまま。
      expect(fake.phase).toBe("awaiting_survey");
      expect(result.current.uiPhase).toBe("running");
      expect(result.current.rollCount).toBe(0);
      expect(result.current.currentBatchRevealed).toHaveLength(0);
      expect(result.current.researchDrawsSaveError).not.toBeNull();
    });

    it("保存失敗後はgiveUp()も禁止される(Core rollCountが確定保存分より先に進んでいるため)", async () => {
      mocks.appendDrawFailOnCallNumber = 1;
      const fake = createFakeCoreSession(null);
      mocks.sessionFactory = () => fake;
      const { result } = renderHook(() => useResearchSession());

      act(() => {
        result.current.startExperiment(TEST_DATASET, TEST_TARGET, 3);
      });
      await act(async () => {
        await result.current.revealBatch();
      });
      expect(result.current.researchDrawsSaveError).not.toBeNull();

      act(() => {
        result.current.giveUp();
      });
      expect(result.current.uiPhase).toBe("running"); // awaiting_surveyへ進まない(giveUpが無視された)
      expect(result.current.finalRecord).toBeNull();
    });

    it(
      "reload(新しいhookインスタンス)してresumeすると、最後の保存成功drawから再開し、欠番が発生しない",
      async () => {
        mocks.appendDrawFailOnCallNumber = 7;
        const fake = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
        mocks.sessionFactory = () => fake;
        const { result } = renderHook(() => useResearchSession());

        act(() => {
          result.current.startExperiment(
            { ...TEST_DATASET, datasetId: "pthumeru_depth5_standard_watchers_v0_1" },
            { ...TEST_TARGET, datasetId: "pthumeru_depth5_standard_watchers_v0_1" },
            3
          );
        });
        const experimentId = loadActiveExperiment()!.experiment_id;

        await act(async () => {
          await result.current.revealBatch();
        });
        expect(result.current.rollCount).toBe(6);

        // reload: 新しいCoreセッション・新しいhookインスタンスとして「続きから」を選ぶ。
        mocks.appendDrawFailOnCallNumber = null; // 新しいsessionでは書き込みは正常に成功する
        const fakeAfterReload = createFakeCoreSession(null, "pthumeru_depth5_standard_watchers_v0_1");
        mocks.sessionFactory = () => fakeAfterReload;
        const { result: resultAfterReload } = renderHook(() => useResearchSession());

        await act(async () => {
          await resultAfterReload.current.resumeExperiment();
        });
        expect(resultAfterReload.current.rollCount).toBe(6);

        await act(async () => {
          await resultAfterReload.current.revealBatch();
        });
        const rows = await listDrawsForExperiment(experimentId);
        expect(rows.map((r) => r.draw_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        // 7件目は欠番にならず、resume後の最初の保存成功drawとして連番のまま7になる。
        expect(rows.find((r) => r.draw_index === 7)).toBeDefined();
      },
      15000
    );
  });
});
