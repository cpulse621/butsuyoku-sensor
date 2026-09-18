import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendDraw, DRAW_DETAIL_SCHEMA_VERSION } from "../storage/researchDrawsDb";
import type { ResearchDrawRecord } from "../storage/researchDrawsDb";
import { getResearchDrawsSyncStatus, saveResearchDrawsSyncStatus } from "../storage/researchDrawsSyncStatus";
import { addExperiment } from "../storage/researchHistory";
import type { ResearchExperiment } from "../storage/researchHistory";

function makeExperiment(overrides: Partial<ResearchExperiment> = {}): ResearchExperiment {
  return {
    experiment_id: "exp-1",
    participant_id: "participant-1",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    duration_ms: 60000,
    dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
    enemy_id: "merciless_watchers",
    enemy_display_name: "3デブ",
    target: {
      shape: ["radial"],
      primary_effect_id: "physical",
      primary_allowed_ranks: [17, 18, 19],
      secondary_effect_id: null,
      secondary_allowed_ranks: null,
      accepted_curse_ids: ["stamina_cost_up"],
    },
    target_label_snapshot: {
      primary_label: "物理攻撃力UP",
      primary_allowed_values: "25.3;26.3;27.2",
      secondary_label: "",
      secondary_allowed_values: "",
      accepted_curse_labels: "スタミナ消費増加",
    },
    desire_score: 5,
    success: true,
    censored: false,
    roll_count: 1,
    cutoff_draws: null,
    batch_count: 1,
    draw_advance_mode: "manual",
    auto_interval_ms: null,
    pause_count: 0,
    paused_duration_ms: 0,
    theoretical_probability: 0.1258,
    expected_draws: 7.95,
    tedious_score: 3,
    real_game_burden_score: 4,
    sensor_score: 5,
    effort_reward_fit_score: 4,
    perceived_expected_draws: 20,
    exit_reason: null,
    termination_reason: "target_match",
    engine_version: "motsuyoku-sensor-core@0.1.0",
    data_version: "v0.12-watchers",
    app_version: "0.2.0",
    research_protocol_version: "v3-coin",
    reveal_mode: "sequential",
    reveal_interval_ms: 400,
    active_duration_ms: 55000,
    resume_count: 0,
    draw_detail_count: 1,
    coin_initial: 100000,
    coin_remaining: 99900,
    coin_used: 100,
    submission_status: "sent",
    ...overrides,
  };
}

function makeDraw(overrides: Partial<ResearchDrawRecord> = {}): ResearchDrawRecord {
  return {
    experiment_id: "exp-1",
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
    coin_cost: 87,
    coin_remaining_after_draw: 99913,
    coin_cost_model_version: "d-normalized-surprisal-v1",
    draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("services/researchDrawsSubmission", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("endpoint未設定ならネットワークアクセスせずlocal_onlyを返す", async () => {
    const { syncResearchDrawsForExperiment, isResearchDrawsSubmissionConfigured } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(isResearchDrawsSubmissionConfigured()).toBe(false);
    const outcome = await syncResearchDrawsForExperiment("exp-none");
    expect(outcome.status).toBe("local_only");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ローカルに記録が無いexperiment_idはHTTP通信なしでsynced(0件)を返す", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-empty");
    expect(outcome).toEqual({ status: "synced", chunkCount: 0, drawCount: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("request_type=research_draws_chunkのenvelopeでPOSTし、experiment_id+draw_indexの複合キーで送る(idの内部keyPathは含まない)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    await appendDraw(makeDraw({ draw_index: 1 }));
    await appendDraw(makeDraw({ draw_index: 2 }));
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 2, inserted: 2, duplicates: 0 }) });
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-1");
    expect(outcome).toEqual({ status: "synced", chunkCount: 1, drawCount: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/exec");
    expect(options.headers["Content-Type"]).toBe("text/plain;charset=UTF-8");
    const body = JSON.parse(options.body);
    expect(body.request_type).toBe("research_draws_chunk");
    expect(body.schema_version).toBe("research-draw-v2");
    expect(body.experiment_id).toBe("exp-1");
    expect(body.chunk_id).toBe("exp-1:1-2");
    expect(body.draws).toHaveLength(2);
    expect(body.draws[0]).not.toHaveProperty("id");
    expect(body.draws[0]).toMatchObject({ experiment_id: "exp-1", draw_index: 1, coin_cost: 87 });
  });

  it("250件を超える場合、複数chunkに分割して送信する(通常chunkサイズ=250)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    for (let i = 1; i <= 300; i++) {
      // eslint-disable-next-line no-await-in-loop
      await appendDraw(makeDraw({ draw_index: i, experiment_id: "exp-big" }));
    }
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, received: 250, inserted: 250, duplicates: 0 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, received: 50, inserted: 50, duplicates: 0 }) });
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-big");
    expect(outcome).toEqual({ status: "synced", chunkCount: 2, drawCount: 300 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(firstBody.draws).toHaveLength(250);
    expect(secondBody.draws).toHaveLength(50);
    expect(firstBody.chunk_id).toBe("exp-big:1-250");
    expect(secondBody.chunk_id).toBe("exp-big:251-300");
  });

  it("最初のchunkが失敗したら、それ以降のchunkは送らず失敗を返す(synced_through_draw_indexは進めない)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    for (let i = 1; i <= 300; i++) {
      // eslint-disable-next-line no-await-in-loop
      await appendDraw(makeDraw({ draw_index: i, experiment_id: "exp-fail" }));
    }
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }); // 1st chunk fails
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-fail");
    expect(outcome.status).toBe("failed");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 2つ目のchunkは送られない

    const status = getResearchDrawsSyncStatus("exp-fail");
    expect(status?.state).toBe("failed");
    expect(status?.synced_through_draw_index).toBe(0);
  });

  it("ネットワーク例外もfailedとして扱う", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    await appendDraw(makeDraw({ experiment_id: "exp-net-error", draw_index: 1 }));
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const outcome = await syncResearchDrawsForExperiment("exp-net-error");
    expect(outcome.status).toBe("failed");
  });

  describe("送信進捗の永続化(再起動をまたいだ再送)", () => {
    it("全chunk成功後、synced_through_draw_indexが永続化され、次回呼び出しではネットワークアクセスしない", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      await appendDraw(makeDraw({ draw_index: 1, experiment_id: "exp-resume-ok" }));
      await appendDraw(makeDraw({ draw_index: 2, experiment_id: "exp-resume-ok" }));
      const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 2, inserted: 2, duplicates: 0 }) });
      vi.stubGlobal("fetch", fetchSpy);

      const first = await syncResearchDrawsForExperiment("exp-resume-ok");
      expect(first).toEqual({ status: "synced", chunkCount: 1, drawCount: 2 });
      const status = getResearchDrawsSyncStatus("exp-resume-ok");
      expect(status?.state).toBe("synced");
      expect(status?.synced_through_draw_index).toBe(2);

      const second = await syncResearchDrawsForExperiment("exp-resume-ok");
      expect(second).toEqual({ status: "synced", chunkCount: 0, drawCount: 0 });
      expect(fetchSpy).toHaveBeenCalledTimes(1); // 2回目はネットワークアクセスなし
    });

    it("1つ目のchunkが成功し2つ目が失敗した場合、synced_through_draw_indexは1つ目の末尾まで進み、次回はそれ以降だけを再送する", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      for (let i = 1; i <= 300; i++) {
        // eslint-disable-next-line no-await-in-loop
        await appendDraw(makeDraw({ draw_index: i, experiment_id: "exp-partial" }));
      }
      const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, received: 250, inserted: 250, duplicates: 0 }) })
        .mockResolvedValueOnce({ ok: false, status: 500 });
      vi.stubGlobal("fetch", fetchSpy);

      const first = await syncResearchDrawsForExperiment("exp-partial");
      expect(first.status).toBe("failed");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const statusAfterFirst = getResearchDrawsSyncStatus("exp-partial");
      expect(statusAfterFirst?.state).toBe("failed");
      expect(statusAfterFirst?.synced_through_draw_index).toBe(250); // 1つ目のchunkの進捗は残る

      fetchSpy.mockReset();
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 50, inserted: 50, duplicates: 0 }) });
      const second = await syncResearchDrawsForExperiment("exp-partial");
      expect(second).toEqual({ status: "synced", chunkCount: 1, drawCount: 50 });
      expect(fetchSpy).toHaveBeenCalledTimes(1); // 251-300だけを再送
      const secondBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(secondBody.chunk_id).toBe("exp-partial:251-300");
      expect(secondBody.draws).toHaveLength(50);

      const statusAfterSecond = getResearchDrawsSyncStatus("exp-partial");
      expect(statusAfterSecond?.state).toBe("synced");
      expect(statusAfterSecond?.synced_through_draw_index).toBe(300);
    });

    it("received !== inserted + duplicatesの場合はHTTP成功でも失敗として扱い、synced_through_draw_indexを進めない", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      await appendDraw(makeDraw({ draw_index: 1, experiment_id: "exp-inconsistent" }));
      await appendDraw(makeDraw({ draw_index: 2, experiment_id: "exp-inconsistent" }));
      const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
      // received=2だがinserted+duplicates=1で不整合。Apps Script側の部分失敗を模したケース。
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 2, inserted: 1, duplicates: 0 }) });
      vi.stubGlobal("fetch", fetchSpy);

      const outcome = await syncResearchDrawsForExperiment("exp-inconsistent");
      expect(outcome.status).toBe("failed");
      const status = getResearchDrawsSyncStatus("exp-inconsistent");
      expect(status?.state).toBe("failed");
      expect(status?.synced_through_draw_index).toBe(0);
    });
  });

  describe("retryAllUnsyncedResearchDraws: Experimentsのsubmission_statusから完全に独立した再送(指示2節)", () => {
    it("Experimentがsent済みでもResearchDrawsが未完了(failed)なら再送する", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      addExperiment(makeExperiment({ experiment_id: "exp-sent-draws-failed", submission_status: "sent" }));
      await appendDraw(makeDraw({ experiment_id: "exp-sent-draws-failed", draw_index: 1 }));
      saveResearchDrawsSyncStatus({
        experiment_id: "exp-sent-draws-failed",
        state: "failed",
        synced_through_draw_index: 0,
        last_error: "HTTP 500",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      const { retryAllUnsyncedResearchDraws } = await import("./researchDrawsSubmission");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 1, inserted: 1, duplicates: 0 }) });
      vi.stubGlobal("fetch", fetchSpy);

      await retryAllUnsyncedResearchDraws();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(getResearchDrawsSyncStatus("exp-sent-draws-failed")?.state).toBe("synced");
    });

    it("ResearchDrawsが未着手(sync statusが存在しない)のexperiment_idも再送対象になる", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      addExperiment(makeExperiment({ experiment_id: "exp-never-attempted", submission_status: "sent" }));
      await appendDraw(makeDraw({ experiment_id: "exp-never-attempted", draw_index: 1 }));
      const { retryAllUnsyncedResearchDraws } = await import("./researchDrawsSubmission");
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 1, inserted: 1, duplicates: 0 }) });
      vi.stubGlobal("fetch", fetchSpy);

      await retryAllUnsyncedResearchDraws();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("synced済みのexperiment_idはネットワークアクセスせずskipする", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      addExperiment(makeExperiment({ experiment_id: "exp-already-synced", submission_status: "sent" }));
      await appendDraw(makeDraw({ experiment_id: "exp-already-synced", draw_index: 1 }));
      saveResearchDrawsSyncStatus({
        experiment_id: "exp-already-synced",
        state: "synced",
        synced_through_draw_index: 1,
        last_error: null,
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      const { retryAllUnsyncedResearchDraws } = await import("./researchDrawsSubmission");
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await retryAllUnsyncedResearchDraws();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("endpoint未設定ならネットワークアクセスせずに何もしない", async () => {
      addExperiment(makeExperiment({ experiment_id: "exp-no-endpoint" }));
      await appendDraw(makeDraw({ experiment_id: "exp-no-endpoint", draw_index: 1 }));
      const { retryAllUnsyncedResearchDraws } = await import("./researchDrawsSubmission");
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await retryAllUnsyncedResearchDraws();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
