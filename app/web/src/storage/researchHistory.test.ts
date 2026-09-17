import { beforeEach, describe, expect, it } from "vitest";
import {
  addExperiment,
  clearActiveExperiment,
  deleteAllExperiments,
  exportExperimentsAsCSV,
  exportExperimentsAsJSON,
  getOrCreateParticipantId,
  listExperiments,
  loadActiveExperiment,
  saveActiveExperiment,
  type ResearchExperiment,
} from "./researchHistory";

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
    draw_detail_status: "local_only",
    coin_initial: 100000,
    coin_remaining: 100000,
    coin_used: 0,
    submission_status: "local_only",
    ...overrides,
  };
}

describe("storage/researchHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getOrCreateParticipantIdはブラウザごとに1つのIDを永続化する", () => {
    const first = getOrCreateParticipantId();
    const second = getOrCreateParticipantId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("addExperiment/listExperimentsで研究履歴が保存・新しい順で取得できる", () => {
    addExperiment(makeExperiment({ experiment_id: "e1" }));
    addExperiment(makeExperiment({ experiment_id: "e2" }));
    const list = listExperiments();
    expect(list.map((e) => e.experiment_id)).toEqual(["e2", "e1"]);
  });

  it("途中終了(censored)のexperimentも保存できる(roll_count=null, cutoff_draws=件数, exit_reasonあり)", () => {
    addExperiment(
      makeExperiment({
        experiment_id: "e-censored",
        success: false,
        censored: true,
        roll_count: null,
        cutoff_draws: 3,
        exit_reason: "tedious",
      })
    );
    const [exp] = listExperiments();
    expect(exp.success).toBe(false);
    expect(exp.censored).toBe(true);
    expect(exp.roll_count).toBeNull();
    expect(exp.cutoff_draws).toBe(3);
    expect(exp.exit_reason).toBe("tedious");
  });

  it("deleteAllExperimentsで全件消える", () => {
    addExperiment(makeExperiment());
    const result = deleteAllExperiments();
    expect(result.ok).toBe(true);
    expect(listExperiments()).toHaveLength(0);
  });

  it("active experimentはreload相当でも読み直せて、破棄すると消える", () => {
    expect(loadActiveExperiment()).toBeNull();

    saveActiveExperiment({
      experiment_id: "exp-active",
      participant_id: "participant-1",
      started_at: "2026-01-01T00:00:00.000Z",
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
      desire_score: 3,
      draw_advance_mode: "auto",
      auto_interval_ms: 10000,
      pause_count: 0,
      paused_duration_ms: 0,
      resume_count: 0,
    });

    // storageはインメモリキャッシュを持たないため、再度呼ぶこと自体がreload後の読み直しと等価。
    const reloaded = loadActiveExperiment();
    expect(reloaded?.experiment_id).toBe("exp-active");

    clearActiveExperiment();
    expect(loadActiveExperiment()).toBeNull();
  });

  it("exportExperimentsAsJSON/CSVが1 experiment = 1 rowで出力される", () => {
    addExperiment(makeExperiment({ experiment_id: "e1" }));

    const json = JSON.parse(exportExperimentsAsJSON());
    expect(json).toHaveLength(1);
    expect(json[0].experiment_id).toBe("e1");

    const csv = exportExperimentsAsCSV();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("experiment_id");
    expect(lines[0]).toContain("submission_status");
    expect(lines[1]).toContain("e1");
  });
});
