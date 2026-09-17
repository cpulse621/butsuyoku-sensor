// ResearchDraws(Apps Scriptへのchunk送信)の送信進捗を、ブラウザ内にのみ永続化する層。
//
// Experiments側の`submission_status`(researchHistory.ts)とは完全に独立した状態である点が重要:
// Experiment本体の送信が成功していても、ResearchDrawsのchunk送信は別のHTTPリクエスト群であり、
// 途中のchunkだけが失敗する・タブが閉じられる、といった形で独立に失敗しうる。この状態を
// experiment_id単位で永続化しておくことで、次回起動時に「どこまで確実に届いたか」から
// 再送を再開できる(全件を毎回送り直す必要をなくす)。
//
// これはGoogle Sheets側の`draw_detail_status`(=永続フィールドとして持たない。Analysis時に
// ResearchDrawsの実件数とExperiments.draw_detail_countを突き合わせて導出する)とは別物であり、
// あくまでクライアント側だけが参照する送信進捗のキャッシュに過ぎない。

const SYNC_STATUS_KEY = "butsuyoku_sensor_research_draws_sync_v1";

export type ResearchDrawsSyncState = "in_progress" | "synced" | "failed";

export interface ResearchDrawsSyncStatus {
  experiment_id: string;
  state: ResearchDrawsSyncState;
  // Apps Script側で`received === inserted + duplicates`が確認できた、連続範囲の末尾draw_index。
  // 0は「まだ1件もackされていない」ことを表す。listDrawsForExperimentが常にdraw_index昇順を
  // 返す前提のもと、「draw_index > synced_through_draw_index」の行だけが未送信とみなせる。
  synced_through_draw_index: number;
  last_error: string | null;
  updated_at: string;
}

type SyncStatusMap = Record<string, ResearchDrawsSyncStatus>;

function readMap(): SyncStatusMap {
  try {
    const raw = localStorage.getItem(SYNC_STATUS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SyncStatusMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: SyncStatusMap): void {
  try {
    localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(map));
  } catch {
    // localStorageが使えない環境ではベストエフォート(送信自体は動くが、進捗は再起動で失われる)。
  }
}

export function getResearchDrawsSyncStatus(experimentId: string): ResearchDrawsSyncStatus | null {
  return readMap()[experimentId] ?? null;
}

export function saveResearchDrawsSyncStatus(status: ResearchDrawsSyncStatus): void {
  const map = readMap();
  map[status.experiment_id] = status;
  writeMap(map);
}

export function deleteResearchDrawsSyncStatus(experimentId: string): void {
  const map = readMap();
  if (experimentId in map) {
    delete map[experimentId];
    writeMap(map);
  }
}

// テスト専用: モジュール外からlocalStorageを直接触らせないための一括リセット。
export function __resetResearchDrawsSyncStatusForTests(): void {
  writeMap({});
}
