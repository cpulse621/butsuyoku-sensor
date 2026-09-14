// 研究モードの実験結果を、ブラウザのlocalStorageへ永続化する層。
// simulationHistory.tsと同様、Reactコンポーネントから直接localStorageを触らせない。
//
// 全DrawResultは保存しない。研究に必要なのは「1実験=1レコード」の要約のみ。
//
// activeExperiment(進行中の実験)は別keyに保存し、ページreloadで失われないようにする。
// ただしCoreのcreateResearchModeSession()が保持する内部状態(乱数の消費位置・pendingBatch等)は
// クロージャ内部にあり、そのままではシリアライズ・復元できない。そのためreload後の「再開」は、
// 同じexperiment_id/started_atを引き継ぎつつ新しいCoreセッションを作り直す形になる
// (roll_countは0から再開する)。この技術的な制約はUI側で必ず利用者に明示する。

import type { StoredTarget } from "./simulationHistory";

const PARTICIPANT_ID_KEY = "motsuyoku_sensor_participant_id_v1";
const HISTORY_KEY = "motsuyoku_sensor_research_history_v1";
const ACTIVE_EXPERIMENT_KEY = "motsuyoku_sensor_active_experiment_v1";

const MAX_EXPERIMENTS = 500;

export type SubmissionStatus = "local_only" | "pending" | "sent" | "failed";

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

  desire_score: 1 | 2 | 3 | 4 | 5;

  success: boolean;
  censored: boolean;

  roll_count: number | null;
  cutoff_draws: number | null;
  batch_count: number;

  theoretical_probability: number | null;
  expected_draws: number | null;

  tedious_score: number | null;
  real_game_burden_score: number | null;
  sensor_score: number | null;

  engine_version: string;
  data_version: string;

  submission_status: SubmissionStatus;
}

// reload後も再開できるように保持する「進行中の実験」の最小限のスナップショット。
// Coreセッションのランタイム状態(乱数消費位置等)は含まれない(含められない)。
export interface ActiveExperimentSnapshot {
  experiment_id: string;
  participant_id: string;
  started_at: string;
  dataset_id: string;
  enemy_id: string;
  enemy_display_name: string;
  target: StoredTarget;
  desire_score: 1 | 2 | 3 | 4 | 5;
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
  "desire_score",
  "success",
  "censored",
  "roll_count",
  "cutoff_draws",
  "batch_count",
  "theoretical_probability",
  "expected_draws",
  "tedious_score",
  "real_game_burden_score",
  "sensor_score",
  "engine_version",
  "data_version",
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
      e.desire_score,
      e.success,
      e.censored,
      e.roll_count,
      e.cutoff_draws,
      e.batch_count,
      e.theoretical_probability,
      e.expected_draws,
      e.tedious_score,
      e.real_game_burden_score,
      e.sensor_score,
      e.engine_version,
      e.data_version,
      e.submission_status,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}
