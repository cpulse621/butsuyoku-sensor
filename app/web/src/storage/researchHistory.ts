// 研究モードの実験結果を、ブラウザのlocalStorageへ永続化する層。
// simulationHistory.tsと同様、Reactコンポーネントから直接localStorageを触らせない。
//
// 全DrawResultは保存しない。研究に必要なのは「1実験=1レコード」の要約のみ。
//
// activeExperiment(進行中の実験)は別keyに保存し、ページreloadで失われないようにする。
// CoreのcreateResearchModeSession()が保持する内部状態(乱数の消費位置・pendingBatch等)は
// クロージャ内部にあり、そのままではシリアライズ・復元できないため、reload後の「再開」は
// 同じexperiment_id/started_atを引き継ぎつつ新しいCoreセッションを作り直す。ただしroll_count・
// batch_count・一時停止回数・active時間は0に戻さず、ResearchDraws(IndexedDB、正本)から
// 復元する(resume案A。詳細は useResearchSession.ts / docs/experiment_ui_flow_spec.md 3.7節)。

import type { StoredTarget } from "./simulationHistory";
import type { TargetLabelSnapshot } from "../lib/targetSummary";

const PARTICIPANT_ID_KEY = "motsuyoku_sensor_participant_id_v1";
const HISTORY_KEY = "motsuyoku_sensor_research_history_v1";
const ACTIVE_EXPERIMENT_KEY = "motsuyoku_sensor_active_experiment_v1";

const MAX_EXPERIMENTS = 500;

export type SubmissionStatus = "local_only" | "pending" | "sent" | "failed";

export type DrawAdvanceMode = "manual" | "auto";

// 途中終了(censored)時の主な理由。sensor_score回答後にのみ尋ねる(回答誘導を避けるため)。
export type ExitReason = "no_target" | "tedious" | "time_limit" | "lost_motivation" | "other";

// 実験がどう終わったか、という「構造的・客観的な理由」。exit_reason(参加者の主観的な理由、
// 自分から終了した場合のみ)とは別軸: coin_exhaustedはexit_reasonへは混ぜない。
// 同一drawでTarget Matchとcoin exhaustionが同時発生した場合はtarget_matchを優先する。
export type TerminationReason = "target_match" | "participant_giveup" | "coin_exhausted";

// 研究プロトコル全体のバージョン。コインをproductionへ配線したこのバッチ以降の実験は
// 明示的にこの値を持つ(既存のv2データへは推測でversionを書き込まない)。
export const RESEARCH_PROTOCOL_VERSION = "v3-coin";
export const REVEAL_MODE = "sequential";

export interface ResearchExperiment {
  experiment_id: string;
  participant_id: string;

  started_at: string;
  finished_at: string;
  duration_ms: number;

  dataset_id: string;
  enemy_id: string;
  enemy_display_name: string;

  target: StoredTarget;
  // targetのID/rankは正本(不変)。表示用のlabel/実数値は、TargetがLOCKされる実験開始時点で
  // 1回だけ計算したsnapshotとして別に保持し、以後(実験中のdataset更新やdeployを跨いでも)
  // 再計算しない。過去の未送信recordにこのsnapshotが無い場合でも、現在のdatasetから
  // 推測でbackfillしない。
  target_label_snapshot: TargetLabelSnapshot;

  desire_score: 1 | 2 | 3 | 4 | 5;

  success: boolean;
  censored: boolean;

  roll_count: number | null;
  cutoff_draws: number | null;
  batch_count: number;

  // manual/auto比較用(PHASE追加分)。参加者には選択させず、実験開始時にランダム割り当てる。
  draw_advance_mode: DrawAdvanceMode;
  auto_interval_ms: number | null; // manualの場合null
  pause_count: number; // autoの一時停止回数(manualは常に0)
  paused_duration_ms: number; // autoの一時停止累計時間(manualは常に0)

  theoretical_probability: number | null;
  expected_draws: number | null;

  // 事後アンケート(順序固定: tedious → real_game_burden → sensor → effort_reward_fit)。
  tedious_score: number | null;
  real_game_burden_score: number | null;
  sensor_score: number | null;
  // Q4: 「今回の結果は、かけた時間や手間にどの程度見合っていたと感じたか」(1-5)。
  // sensor_scoreより後に置き、sensor_scoreへの誘導を避ける(指示C節)。
  // effort_reward_mismatch_score(6-この値)はAnalysis側で算出する派生値のため、ここには保存しない。
  effort_reward_fit_score: number | null;
  // Q5: 「平均すると何回に1回くらい出ると思ったか」の主観的な期待試行回数。
  // 理論確率を開示する直前、Q4の後に尋ねる。スライダーの最終仕様(桁数・範囲)は未確定。
  perceived_expected_draws: number | null;

  // 途中終了時のみ設定(成功時はnull)。sensor_score回答後に尋ねる。参加者自身の主観的な理由。
  exit_reason: ExitReason | null;
  // 実験がどう終わったかの客観的・構造的な理由(exit_reasonとは別軸。指示K節)。
  termination_reason: TerminationReason;

  engine_version: string;
  data_version: string;

  // バージョン管理(指示N節)。既存レコードには存在しない(推測で書き込まない)。
  app_version: string;
  research_protocol_version: string;
  reveal_mode: typeof REVEAL_MODE;
  reveal_interval_ms: number;

  // 画面を離れていた時間をactivity(努力・苦労)として誤カウントしないための追加指標。
  // duration_ms(壁時計、既存・後方互換のため変更しない)とは別に、実際に画面を見ていた
  // 時間の累積(auto一時停止中・タブ非表示中を除く)をactive_duration_msとして持つ。
  active_duration_ms: number;
  // reload後にresumeした回数(0なら一度も中断されていない)。
  resume_count: number;

  // ResearchDraws(1 visible draw = 1 record)との整合確認用(指示O節)。
  // Experiments上のdraw数とResearchDrawsの実際の行数が一致しているかをここで検証できる。
  draw_detail_count: number;
  draw_detail_status: SubmissionStatus;

  // コイン(有限resource/cost体験。docs/experiment_ui_flow_spec.md 3.8/3.8.1節参照)の
  // 実験サマリ。個々のdrawごとの内訳はResearchDraws(coin_cost/coin_remaining_after_draw)を
  // 参照する。coin_used = coin_initial - coin_remaining(丸め・オーバーシュートを含む実消費量。
  // coin_exhausted時はcoin_initialを超えることがある)。coin_remainingは0未満にはならない
  // (表示・保存とも下限0でclampする)。v3-coinより前のレコードには存在しない。
  coin_initial: number;
  coin_remaining: number;
  coin_used: number;

  submission_status: SubmissionStatus;
}

// reload後も再開できるように保持する「進行中の実験」の最小限のスナップショット。
// Coreセッションのランタイム状態(乱数消費位置等)は含まれない(含められない)。
//
// roll_count・batch_count・active_elapsed_ms・wall_elapsed_msの「直近の値」自体はここには
// 持たない。これらはResearchDraws(IndexedDB, storage/researchDrawsDb.ts)に保存済みの
// 「最後のvisible draw」の行を正本として復元する(resume案A)。ここに持つのは、
// ResearchDraws側だけでは復元できない値(pause状態・resume回数・実験の識別情報)のみ。
export interface ActiveExperimentSnapshot {
  experiment_id: string;
  participant_id: string;
  started_at: string;
  dataset_id: string;
  enemy_id: string;
  enemy_display_name: string;
  target: StoredTarget;
  // 実験開始(TargetがLOCKされた瞬間)に計算済みのsnapshot。reload/resume後も
  // これをそのまま引き継ぎ、再計算しない(指示1節)。このsnapshot導入より前に
  // 保存されたactiveExperimentには存在しない可能性があるため、読み出し側はoptional前提で扱う。
  target_label_snapshot?: TargetLabelSnapshot;
  desire_score: 1 | 2 | 3 | 4 | 5;
  draw_advance_mode: DrawAdvanceMode;
  auto_interval_ms: number | null;
  pause_count: number;
  paused_duration_ms: number;
  resume_count: number;
}

export interface StorageResult {
  ok: boolean;
  error?: string;
}

export function getOrCreateParticipantId(): string {
  try {
    const existing = localStorage.getItem(PARTICIPANT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PARTICIPANT_ID_KEY, id);
    return id;
  } catch {
    // localStorageが使えない環境向けのフォールバック(永続化はされない)。
    return crypto.randomUUID();
  }
}

function readAll(): ResearchExperiment[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(experiments: ResearchExperiment[]): StorageResult {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(experiments));
    return { ok: true };
  } catch (err) {
    try {
      const trimmed = experiments.slice(-Math.max(1, Math.floor(experiments.length / 2)));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return { ok: true };
    } catch (err2) {
      return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
    }
  }
}

export function addExperiment(experiment: ResearchExperiment): StorageResult {
  const experiments = readAll();
  experiments.push(experiment);
  while (experiments.length > MAX_EXPERIMENTS) experiments.shift();
  return writeAll(experiments);
}

export function updateExperimentSubmissionStatus(experimentId: string, status: SubmissionStatus): StorageResult {
  const experiments = readAll();
  const exp = experiments.find((e) => e.experiment_id === experimentId);
  if (!exp) return { ok: false, error: `experiment "${experimentId}" が見つかりません` };
  exp.submission_status = status;
  return writeAll(experiments);
}

// ResearchDraws(IndexedDB)の実カウントが確定した時点で、Experiments側のdraw_detail_countを
// 更新する(指示O節: Experiments上のdraw数とResearchDrawsの実際の行数が一致しているか確認できるように)。
export function updateExperimentDrawDetailCount(experimentId: string, count: number): StorageResult {
  const experiments = readAll();
  const exp = experiments.find((e) => e.experiment_id === experimentId);
  if (!exp) return { ok: false, error: `experiment "${experimentId}" が見つかりません` };
  exp.draw_detail_count = count;
  return writeAll(experiments);
}

export function listExperiments(): ResearchExperiment[] {
  return readAll().slice().reverse();
}

export function deleteAllExperiments(): StorageResult {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function saveActiveExperiment(snapshot: ActiveExperimentSnapshot): StorageResult {
  try {
    localStorage.setItem(ACTIVE_EXPERIMENT_KEY, JSON.stringify(snapshot));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function loadActiveExperiment(): ActiveExperimentSnapshot | null {
  try {
    const raw = localStorage.getItem(ACTIVE_EXPERIMENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveExperimentSnapshot;
  } catch {
    return null;
  }
}

export function clearActiveExperiment(): void {
  try {
    localStorage.removeItem(ACTIVE_EXPERIMENT_KEY);
  } catch {
    // 消せなくても致命的ではない(次回上書きされる)。
  }
}

export function exportExperimentsAsJSON(): string {
  return JSON.stringify(listExperiments(), null, 2);
}

function csvEscape(value: string | number | boolean | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  "experiment_id",
  "participant_id",
  "started_at",
  "finished_at",
  "duration_ms",
  "dataset_id",
  "enemy_id",
  "enemy_display_name",
  "target_shape",
  "target_primary_effect_id",
  "target_primary_allowed_ranks",
  "target_secondary_effect_id",
  "target_secondary_allowed_ranks",
  "target_accepted_curse_ids",
  "primary_label",
  "primary_allowed_values",
  "secondary_label",
  "secondary_allowed_values",
  "accepted_curse_labels",
  "desire_score",
  "success",
  "censored",
  "roll_count",
  "cutoff_draws",
  "batch_count",
  "draw_advance_mode",
  "auto_interval_ms",
  "pause_count",
  "paused_duration_ms",
  "theoretical_probability",
  "expected_draws",
  "tedious_score",
  "real_game_burden_score",
  "sensor_score",
  "effort_reward_fit_score",
  "perceived_expected_draws",
  "exit_reason",
  "termination_reason",
  "engine_version",
  "data_version",
  "app_version",
  "research_protocol_version",
  "reveal_mode",
  "reveal_interval_ms",
  "active_duration_ms",
  "resume_count",
  "draw_detail_count",
  "draw_detail_status",
  "coin_initial",
  "coin_remaining",
  "coin_used",
  "submission_status",
];

// 1 experiment = 1 row。Google Sheetsへそのままimportしやすい形式。
export function exportExperimentsAsCSV(): string {
  const rows = listExperiments().map((e) =>
    [
      e.experiment_id,
      e.participant_id,
      e.started_at,
      e.finished_at,
      e.duration_ms,
      e.dataset_id,
      e.enemy_id,
      e.enemy_display_name,
      e.target.shape.join(";"),
      e.target.primary_effect_id,
      e.target.primary_allowed_ranks.join(";"),
      e.target.secondary_effect_id ?? "",
      e.target.secondary_allowed_ranks?.join(";") ?? "",
      e.target.accepted_curse_ids.join(";"),
      e.target_label_snapshot.primary_label,
      e.target_label_snapshot.primary_allowed_values,
      e.target_label_snapshot.secondary_label,
      e.target_label_snapshot.secondary_allowed_values,
      e.target_label_snapshot.accepted_curse_labels,
      e.desire_score,
      e.success,
      e.censored,
      e.roll_count,
      e.cutoff_draws,
      e.batch_count,
      e.draw_advance_mode,
      e.auto_interval_ms,
      e.pause_count,
      e.paused_duration_ms,
      e.theoretical_probability,
      e.expected_draws,
      e.tedious_score,
      e.real_game_burden_score,
      e.sensor_score,
      e.effort_reward_fit_score,
      e.perceived_expected_draws,
      e.exit_reason,
      e.termination_reason,
      e.engine_version,
      e.data_version,
      e.app_version,
      e.research_protocol_version,
      e.reveal_mode,
      e.reveal_interval_ms,
      e.active_duration_ms,
      e.resume_count,
      e.draw_detail_count,
      e.draw_detail_status,
      e.coin_initial,
      e.coin_remaining,
      e.coin_used,
      e.submission_status,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}
