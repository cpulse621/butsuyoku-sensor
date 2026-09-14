// シミュレーターモードの抽選記録を、ブラウザのlocalStorageへ永続化する層。
//
// 設計方針:
// - Reactコンポーネントからは直接 localStorage / JSON.stringify 等を触らず、
//   必ずこのモジュール(storage/simulationHistory.ts)経由でsessionを読み書きする。
// - 将来Google Sheets等の外部送信を追加する場合は、この層のデータ形状(SimulationSession)を
//   そのまま送信ペイロードの元にできるようにし、UI側のコード変更を最小化する。
//   今回は外部送信は一切行わない(localStorageのみ)。
// - 保存keyにバージョンサフィックスを付け、将来のスキーマ変更時に旧データと衝突しないようにする。

const STORAGE_KEY = "motsuyoku_sensor_simulation_history_v1";

// 端末内の記録が際限なく肥大化しないための上限。
// 通常の実験・検証用途であれば十分な件数であり、超過分は古いものから間引く。
const MAX_SESSIONS = 30;
const MAX_DRAWS_PER_SESSION = 2000; // 1session あたり最大200回の「10連」相当

export interface StoredTarget {
  shape: string[];
  primary_effect_id: string;
  primary_allowed_ranks: number[];
  secondary_effect_id: string | null;
  secondary_allowed_ranks: number[] | null;
  accepted_curse_ids: string[];
}

export interface StoredDraw {
  sequence_number: number;
  shape: string;
  primary_effect_id: string;
  primary_rank: number;
  primary_value: number | null;
  secondary_effect_id: string | null;
  secondary_rank: number | null;
  secondary_value: number | null;
  curse_id: string;
  // TargetMatcher(isMatch)の結果をそのまま保存したもの。ここでは一切再計算しない。
  matched: boolean;
}

export interface SimulationSession {
  session_id: string;
  started_at: string; // ISO8601
  updated_at: string; // ISO8601
  enemy_id: string;
  enemy_display_name: string; // 履歴一覧表示用。Core呼び出しはApp側で完結させ、ここには結果だけ渡してもらう。
  dataset_id: string;
  target: StoredTarget;
  target_summary: string; // 履歴一覧用の短い要約文字列(App側で組み立てて渡す)。
  theoretical_probability: number | null; // ProbabilityEngineの結果(p)のスナップショット。
  total_draws: number;
  batch_count: number;
  match_count: number;
  draws: StoredDraw[];
}

export interface StorageResult {
  ok: boolean;
  error?: string;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  enemy_display_name: string;
  target_summary: string;
  total_draws: number;
  match_count: number;
}

function readAll(): SimulationSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 壊れたJSON等は「記録なし」として扱う(例外を投げてUIを壊さない)。
    return [];
  }
}

function writeAll(sessions: SimulationSession[]): StorageResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return { ok: true };
  } catch (err) {
    // 容量超過(QuotaExceededError等)の場合、古いsessionを半分に間引いて1度だけ再試行する。
    try {
      const trimmed = sessions.slice(-Math.max(1, Math.floor(sessions.length / 2)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return { ok: true };
    } catch (err2) {
      return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
    }
  }
}

export function createSession(params: {
  sessionId: string;
  enemyId: string;
  enemyDisplayName: string;
  datasetId: string;
  target: StoredTarget;
  targetSummary: string;
  theoreticalProbability: number | null;
}): StorageResult {
  const sessions = readAll();
  const now = new Date().toISOString();
  const session: SimulationSession = {
    session_id: params.sessionId,
    started_at: now,
    updated_at: now,
    enemy_id: params.enemyId,
    enemy_display_name: params.enemyDisplayName,
    dataset_id: params.datasetId,
    target: params.target,
    target_summary: params.targetSummary,
    theoretical_probability: params.theoreticalProbability,
    total_draws: 0,
    batch_count: 0,
    match_count: 0,
    draws: [],
  };
  sessions.push(session);
  while (sessions.length > MAX_SESSIONS) sessions.shift();
  return writeAll(sessions);
}

// 「10回抽選」1回分(=1バッチ)の記録を追加する。sequence_numberはsession内通算番号。
export function appendDraws(sessionId: string, draws: StoredDraw[]): StorageResult {
  const sessions = readAll();
  const session = sessions.find((s) => s.session_id === sessionId);
  if (!session) return { ok: false, error: `session "${sessionId}" が見つかりません` };

  session.draws.push(...draws);
  if (session.draws.length > MAX_DRAWS_PER_SESSION) {
    session.draws = session.draws.slice(-MAX_DRAWS_PER_SESSION);
  }
  session.total_draws += draws.length;
  session.batch_count += 1;
  session.match_count += draws.filter((d) => d.matched).length;
  session.updated_at = new Date().toISOString();

  return writeAll(sessions);
}

export function getSession(sessionId: string): SimulationSession | null {
  return readAll().find((s) => s.session_id === sessionId) ?? null;
}

export function listSessionSummaries(): SessionSummary[] {
  return readAll()
    .slice()
    .reverse() // 新しいsessionを先頭に
    .map((s) => ({
      session_id: s.session_id,
      started_at: s.started_at,
      enemy_display_name: s.enemy_display_name,
      target_summary: s.target_summary,
      total_draws: s.total_draws,
      match_count: s.match_count,
    }));
}

export function deleteAllHistory(): StorageResult {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
