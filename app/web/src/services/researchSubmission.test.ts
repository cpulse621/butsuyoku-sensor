import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addExperiment, listExperiments } from "../storage/researchHistory";
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
    roll_count: 42,
    cutoff_draws: null,
    batch_count: 5,
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
    app_version: "0.1.0",
    research_protocol_version: "v3-coin",
    reveal_mode: "sequential",
    reveal_interval_ms: 400,
    active_duration_ms: 55000,
    resume_count: 0,
    draw_detail_count: 42,
    coin_initial: 100000,
    coin_remaining: 100000,
    coin_used: 0,
    submission_status: "pending",
    ...overrides,
  };
}

describe("services/researchSubmission", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("endpoint未設定ならネットワークアクセスせずlocal_onlyを返す", async () => {
    const { submitExperiment, isSubmissionConfigured } = await import("./researchSubmission");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(isSubmissionConfigured()).toBe(false);
    const outcome = await submitExperiment(makeExperiment());
    expect(outcome.status).toBe("local_only");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("endpoint設定済みなら、text/plainヘッダでJSON文字列をPOSTする", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { submitExperiment } = await import("./researchSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false, experiment_id: "exp-1", row: 5 }) });
    vi.stubGlobal("fetch", fetchSpy);

    const experiment = makeExperiment();
    const outcome = await submitExperiment(experiment);

    expect(outcome.status).toBe("sent");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/exec");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("text/plain;charset=UTF-8");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      request_type: "experiment",
      schema_version: "experiment-v3",
      payload: { experiment_id: "exp-1" },
    });
  });

  it("送信するJSONはtargetをフラット化したトップレベルキーを持つ(ネストされたtargetオブジェクトは送らない)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { submitExperiment } = await import("./researchSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false, experiment_id: "exp-1", row: 5 }) });
    vi.stubGlobal("fetch", fetchSpy);

    const experiment = makeExperiment({
      target: {
        shape: ["radial", "triangle"],
        primary_effect_id: "physical",
        primary_allowed_ranks: [17, 18],
        secondary_effect_id: null,
        secondary_allowed_ranks: null,
        accepted_curse_ids: ["stamina_cost_up", "hp_deplete"],
      },
      // target_label_snapshotはfinalize時点のスナップショットなので、target側を上書きするなら
      // 対応するsnapshotも合わせて上書きする(このテストではsubmissionDto自体がsnapshotを
      // 再導出しないことは別テストで確認済みのため、ここでは単に整合した値を渡す)。
      target_label_snapshot: {
        primary_label: "物理攻撃力UP",
        primary_allowed_values: "25.3;26.3",
        secondary_label: "",
        secondary_allowed_values: "",
        accepted_curse_labels: "スタミナ消費増加;HP減少",
      },
    });
    await submitExperiment(experiment);

    const envelope = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(envelope.request_type).toBe("experiment");
    const body = envelope.payload;
    expect(body.target).toBeUndefined();
    expect(body.shape).toBe("radial;triangle");
    expect(body.primary_effect_id).toBe("physical");
    expect(typeof body.primary_label).toBe("string");
    expect(body.primary_label.length).toBeGreaterThan(0);
    expect(body.primary_allowed_ranks).toBe("17;18");
    expect(body.secondary_effect_id).toBe("");
    expect(body.secondary_label).toBe("");
    expect(body.accepted_curse_ids).toBe("stamina_cost_up;hp_deplete");
    expect(body.accepted_curse_labels.split(";")).toHaveLength(2);
  });

  it("HTTPエラー応答はfailedを返す", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { submitExperiment } = await import("./researchSubmission");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const outcome = await submitExperiment(makeExperiment());
    expect(outcome.status).toBe("failed");
  });

  it("ネットワーク例外もfailedとして扱う(データは失われない)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { submitExperiment } = await import("./researchSubmission");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const outcome = await submitExperiment(makeExperiment());
    expect(outcome.status).toBe("failed");
  });

  it("attemptSubmissionは送信結果をresearchHistoryのsubmission_statusへ反映する", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { attemptSubmission } = await import("./researchSubmission");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false }) }));

    const experiment = makeExperiment({ experiment_id: "e-attempt" });
    addExperiment(experiment);

    const outcome = await attemptSubmission(experiment);
    expect(outcome.status).toBe("sent");
    const [saved] = listExperiments();
    expect(saved.submission_status).toBe("sent");
  });

  it("retryAllPendingSubmissionsはpending/failedのみ再送し、sent済みは触らない", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { retryAllPendingSubmissions } = await import("./researchSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false }) });
    vi.stubGlobal("fetch", fetchSpy);

    addExperiment(makeExperiment({ experiment_id: "e-pending", submission_status: "pending" }));
    addExperiment(makeExperiment({ experiment_id: "e-failed", submission_status: "failed" }));
    addExperiment(makeExperiment({ experiment_id: "e-sent", submission_status: "sent" }));

    await retryAllPendingSubmissions();

    expect(fetchSpy).toHaveBeenCalledTimes(2); // pending + failedのみ
    const all = listExperiments();
    expect(all.find((e) => e.experiment_id === "e-pending")?.submission_status).toBe("sent");
    expect(all.find((e) => e.experiment_id === "e-failed")?.submission_status).toBe("sent");
  });

  it("同一experiment_idを再送しても、ローカル側で行が増えたりはしない(重複防止はApps Script側の責務)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { attemptSubmission } = await import("./researchSubmission");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: true }) }));

    const experiment = makeExperiment({ experiment_id: "e-dup" });
    addExperiment(experiment);
    await attemptSubmission(experiment);
    await attemptSubmission(experiment);

    expect(listExperiments()).toHaveLength(1); // ローカル側は常に1件のまま
  });

  describe("Apps Scriptのレスポンス本文のack検証(HTTP 200でもok:falseならfailed扱いにする)", () => {
    it("HTTP200 + {ok:true, duplicate:false} → sent", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false, experiment_id: "exp-1", row: 3 }) }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome).toEqual({ status: "sent" });
    });

    it("HTTP200 + {ok:true, duplicate:true} → sent(既存experiment_idの再送は失敗ではない)", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: true, experiment_id: "exp-1" }) }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome).toEqual({ status: "sent" });
    });

    it("HTTP200 + {ok:false, error:\"experiment_validation_failed\"} → failedとして扱い、エラー文字列を残す", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ ok: false, error: "experiment_validation_failed", missing_fields: ["coin_used"] }),
        })
      );

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
      expect(outcome).toMatchObject({ error: "experiment_validation_failed" });
    });

    it("HTTP200 + server_busy等のApps Scriptエラー応答もfailedとして扱う", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false, error: "server_busy" }) }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
      expect(outcome).toMatchObject({ error: "server_busy" });
    });

    it("HTTP200だがJSON本文がnullならfailedとして扱う", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
    });

    it("HTTP200だがJSONとして解釈できない(res.jsonが例外を投げる)場合もfailedとして扱う", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not valid JSON");
          },
        })
      );

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
    });

    it("HTTP200だがJSON形状が不正(okがboolean以外)ならfailedとして扱う", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: "yes" }) }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
    });

    it("HTTP自体の失敗(transport failure)は引き続きfailedとして扱う(既存挙動の維持)", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { submitExperiment } = await import("./researchSubmission");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const outcome = await submitExperiment(makeExperiment());
      expect(outcome.status).toBe("failed");
    });

    it("failedになった送信は、retryAllPendingSubmissionsで後から再送できる(既存仕様の維持)", async () => {
      vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
      const { attemptSubmission, retryAllPendingSubmissions } = await import("./researchSubmission");
      const fetchSpy = vi.fn();
      // 1回目: server-side validation失敗を模す。2回目(再送): 成功する。
      fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: false, error: "experiment_validation_failed" }) });
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: false }) });
      vi.stubGlobal("fetch", fetchSpy);

      const experiment = makeExperiment({ experiment_id: "e-retry-after-ack-failure" });
      addExperiment(experiment);
      await attemptSubmission(experiment);
      expect(listExperiments().find((e) => e.experiment_id === "e-retry-after-ack-failure")?.submission_status).toBe("failed");

      await retryAllPendingSubmissions();
      expect(listExperiments().find((e) => e.experiment_id === "e-retry-after-ack-failure")?.submission_status).toBe("sent");
    });
  });
});
