import { describe, expect, it } from "vitest";
import { WatchersDataset, MadmanDataset } from "motsuyoku-sensor-core";
import type { ResearchExperiment } from "../storage/researchHistory";
import { buildTargetLabelSnapshot } from "../lib/targetSummary";
import { buildExperimentSubmissionPayload } from "./submissionDto";

function makeExperiment(overrides: Partial<ResearchExperiment> = {}): ResearchExperiment {
  return {
    experiment_id: "exp-1",
    participant_id: "participant-1",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    duration_ms: 60000,
    dataset_id: WatchersDataset.datasetId,
    enemy_id: "merciless_watchers",
    enemy_display_name: "3デブ",
    target: {
      shape: ["radial"],
      primary_effect_id: "physical",
      primary_allowed_ranks: [17, 18],
      secondary_effect_id: null,
      secondary_allowed_ranks: null,
      accepted_curse_ids: ["stamina_cost_up"],
    },
    target_label_snapshot: buildTargetLabelSnapshot(WatchersDataset, {
      datasetId: WatchersDataset.datasetId,
      acceptedShapes: ["radial"],
      primaryEffectId: "physical",
      acceptedPrimaryRanks: [17, 18],
      acceptedCurses: ["stamina_cost_up"],
    }),
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

describe("services/submissionDto", () => {
  it("targetをフラット化し、Sheetsの列名と一致するトップレベルキーへ展開する", () => {
    const payload = buildExperimentSubmissionPayload(makeExperiment());
    expect((payload as unknown as { target?: unknown }).target).toBeUndefined();
    expect((payload as unknown as { target_label_snapshot?: unknown }).target_label_snapshot).toBeUndefined();
    expect(payload.shape).toBe("radial");
    expect(payload.primary_effect_id).toBe("physical");
    expect(payload.primary_allowed_ranks).toBe("17;18");
    expect(payload.accepted_curse_ids).toBe("stamina_cost_up");
    expect(payload.experiment_id).toBe("exp-1"); // target以外の既存フィールドはそのまま残る
  });

  it("primary_label/accepted_curse_labelsは実験確定時点のsnapshot(target_label_snapshot)をそのまま使う", () => {
    const payload = buildExperimentSubmissionPayload(makeExperiment());
    expect(payload.primary_label).toBe("物理攻撃力UP");
    expect(payload.accepted_curse_labels).toBe("スタミナ消費増加");
  });

  it("primary_allowed_valuesはsnapshot内の値をそのまま使う(送信時点で現在のdatasetから再導出しない)", () => {
    const payload = buildExperimentSubmissionPayload(makeExperiment());
    const values = payload.primary_allowed_values.split(";");
    expect(values).toHaveLength(2); // ranks=[17,18]と同じ件数
  });

  it("secondaryがnullのTargetでは secondary_* はすべて空文字になる(3デブ)", () => {
    const payload = buildExperimentSubmissionPayload(makeExperiment());
    expect(payload.secondary_effect_id).toBe("");
    expect(payload.secondary_label).toBe("");
    expect(payload.secondary_allowed_ranks).toBe("");
    expect(payload.secondary_allowed_values).toBe("");
  });

  it("secondaryが設定されたTargetでは secondary_label/secondary_allowed_values もsnapshotから展開される(貞子)", () => {
    const experiment = makeExperiment({
      dataset_id: MadmanDataset.datasetId,
      target: {
        shape: ["radial"],
        primary_effect_id: "physical",
        primary_allowed_ranks: [18],
        secondary_effect_id: "striking_charge",
        secondary_allowed_ranks: [17, 18],
        accepted_curse_ids: ["stamina_cost_up", "hp_deplete"],
      },
      target_label_snapshot: buildTargetLabelSnapshot(MadmanDataset, {
        datasetId: MadmanDataset.datasetId,
        acceptedShapes: ["radial"],
        primaryEffectId: "physical",
        acceptedPrimaryRanks: [18],
        secondaryEffectId: "striking_charge",
        acceptedSecondaryRanks: [17, 18],
        acceptedCurses: ["stamina_cost_up", "hp_deplete"],
      }),
    });
    const payload = buildExperimentSubmissionPayload(experiment);
    expect(payload.secondary_effect_id).toBe("striking_charge");
    expect(payload.secondary_label.length).toBeGreaterThan(0);
    expect(payload.secondary_allowed_ranks).toBe("17;18");
    expect(payload.accepted_curse_labels.split(";")).toHaveLength(2);
  });

  it("snapshotが無い(このsnapshot導入より前に保存された)recordでもfail-softにID/rankのフラット化だけは行う(label/allowed_valuesは空文字、現在のdatasetから推測backfillしない)", () => {
    const experiment = makeExperiment();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (experiment as any).target_label_snapshot;
    const payload = buildExperimentSubmissionPayload(experiment);
    expect(payload.shape).toBe("radial");
    expect(payload.primary_effect_id).toBe("physical");
    expect(payload.primary_label).toBe("");
    expect(payload.primary_allowed_values).toBe("");
  });

  it("dataset更新後に再送しても、送信されるlabel/allowed_valuesはsnapshot時点のまま変化しない", () => {
    // 実験当時のsnapshotをわざと「現在のdatasetから導出したものとは異なる」値にすり替え、
    // buildExperimentSubmissionPayloadが送信時点で再導出しない(snapshotをそのまま使う)ことを確認する。
    const staleSnapshot = {
      primary_label: "旧バージョン時点のラベル",
      primary_allowed_values: "999;999",
      secondary_label: "",
      secondary_allowed_values: "",
      accepted_curse_labels: "旧ラベル",
    };
    const experiment = makeExperiment({ target_label_snapshot: staleSnapshot });
    const payload = buildExperimentSubmissionPayload(experiment);
    expect(payload.primary_label).toBe("旧バージョン時点のラベル");
    expect(payload.primary_allowed_values).toBe("999;999");
  });

  it("既存の送信済みSheetsデータをこの関数で一括backfillする用途を想定していない(1件変換ずつの純粋関数)", () => {
    // 回帰目的のドキュメンテーションテスト: 副作用(localStorage書き換え等)が無いことだけを確認する。
    const before = JSON.stringify(makeExperiment());
    const experiment = makeExperiment();
    buildExperimentSubmissionPayload(experiment);
    expect(JSON.stringify(experiment)).toBe(before);
  });
});
