// シミュレーターモードの抽選記録を、ブラウザのlocalStorageへ永続化する層。
//
// 設計方針:
// - Reactコンポーネントからは直接 localStorage / JSON.stringify 等を触らず、
//   必ずこのモジュール(storage/simulationHistory.ts)経由でsessionを読み書きする。
// - 将来Google Sheets等の外部送信を追加する場合は、この層のデータ形状(SimulationSession)を
//   そのまま送信ペイロードの元にできるようにし、UI側のコード変更を最小化する。
//   今回は外部送信は一切行わない(localStorageのみ)。
// - 保存keyにバージョンサフィックスを付け、将来のスキーマ変更時に旧データと衝突しないようにする。
// - 血晶マラソンは数万〜数十万drawに達しうるため、個々のdraw結果は保存しない。
//   長期保存するのは「session要約(合計試行数・バッチ数・一致数)」のみとする。
//   直近の10連結果(表示用)はReact state側で保持し、ここには一切渡さない。

const STORAGE_KEY = "motsuyoku_sensor_simulation_history_v1";

// 端末内の記録が際限なく肥大化しないための上限。要約のみの保存のため十分小さく収まる。
const MAX_SESSIONS = 200;

export interface StoredTarget {
  shape: string[];
  primary_effect_id: string;
  primary_allowed_ranks: number[];
  secondary_effect_id: string | null;
  secondary_allowed_ranks: number[] | null;
  accepted_curse_ids: string[];
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
}

export interface StorageResult {
  ok: boolean;
  error?: string;
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
  };
  sessions.push(session);
  while (sessions.length > MAX_SESSIONS) sessions.shift();
  return writeAll(sessions);
}

// 「10回抽選」1回分(=1バッチ)の要約(件数・一致数)だけを積算する。個々のdrawは保存しない。
export function recordBatchSummary(sessionId: string, batchSize: number, matchCount: number): StorageResult {
  const sessions = readAll();
  const session = sessions.find((s) => s.session_id === sessionId);
  if (!session) return { ok: false, error: `session "${sessionId}" が見つかりません` };

  session.total_draws += batchSize;
  session.batch_count += 1;
  session.match_count += matchCount;
  session.updated_at = new Date().toISOString();

  return writeAll(sessions);
}

export function getSession(sessionId: string): SimulationSession | null {
  return readAll().find((s) => s.session_id === sessionId) ?? null;
}

export function listSessions(): SimulationSession[] {
  return readAll().slice().reverse(); // 新しいsessionを先頭に
}

export function deleteAllHistory(): StorageResult {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function exportSessionsAsJSON(): string {
  return JSON.stringify(listSessions(), null, 2);
}

function csvEscape(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  "session_id",
  "started_at",
  "updated_at",
  "enemy_id",
  "enemy_display_name",
  "dataset_id",
  "target_shape",
  "target_primary_effect_id",
  "target_primary_allowed_ranks",
  "target_secondary_effect_id",
  "target_secondary_allowed_ranks",
  "target_accepted_curse_ids",
  "theoretical_probability",
  "total_draws",
  "batch_count",
  "match_count",
];

// 1 session = 1 row。Google Sheetsへそのままimportしやすい形式。
export function exportSessionsAsCSV(): string {
  const rows = listSessions().map((s) =>
    [
      s.session_id,
      s.started_at,
      s.updated_at,
      s.enemy_id,
      s.enemy_display_name,
      s.dataset_id,
      s.target.shape.join(";"),
      s.target.primary_effect_id,
      s.target.primary_allowed_ranks.join(";"),
      s.target.secondary_effect_id ?? "",
      s.target.secondary_allowed_ranks?.join(";") ?? "",
      s.target.accepted_curse_ids.join(";"),
      s.theoretical_probability ?? "",
      s.total_draws,
      s.batch_count,
      s.match_count,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}
