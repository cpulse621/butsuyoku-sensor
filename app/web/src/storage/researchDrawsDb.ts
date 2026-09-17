// Research modeで参加者に実際に提示された(=visible)血晶1件ごとのraw原本を保存する層。
//
// 設計方針(実装指示F・O節):
// - 1 visible draw = 1 record。「内部で生成されたがTarget Match後などで参加者に見せなかったdraw」は
//   ここへは一切保存しない(呼び出し側=useResearchSessionが、実際に画面へ出した分だけappendDrawを呼ぶ)。
// - near miss等の定義は収集時に固定しない。BloodGemのcanonicalなraw fieldをそのまま保存し、
//   near_miss=trueのような解釈済みフラグだけを残してraw情報を捨てることはしない。
// - 数万〜数十万件に達しうるため、localStorageではなくIndexedDBを使う。
// - experiment_id + draw_index を一意キー(id)にすることで、再送・再チェックポイントを
//   idempotentにする(同じキーへのputは上書きになり、重複レコードを生まない)。
// - Apps Script側のResearchDraws受信endpointはまだ確定していない(現物確認後に対応する)ため、
//   ここではローカル永続化とidempotentなchunk読み出しまでを提供する。ネットワーク送信自体は
//   researchSubmission.tsと同じ「endpoint未設定なら何もしない」パターンに合わせて別途実装する。

const DB_NAME = "motsuyoku_sensor_research_draws_v1";
const DB_VERSION = 1;
const STORE_NAME = "draws";
const EXPERIMENT_INDEX = "experiment_id";

// v2: 確率監査用スナップショット(gem_probability_exact/gem_surprisal_bits)と
// coin_cost_model_versionを追加。coin_costがそのdrawの確率に依存する式(D方式)になるため、
// 「なぜこのdrawでこのcoin_costだったか」を将来完全に監査・再計算できるようにするための追加。
export const DRAW_DETAIL_SCHEMA_VERSION = 2;

export interface ResearchDrawRecord {
  experiment_id: string;
  draw_index: number; // 実験全体を通した絶対通し番号(resumeを跨いでも連続)
  batch_index: number; // 「次の10連」何回目の操作で生成されたか(resume跨ぎではベストエフォート)
  active_elapsed_ms: number; // 参加者が実際に画面上で活動していた累積時間(このdraw提示時点)
  wall_elapsed_ms: number; // 実験開始(started_at)からこのdraw提示までの壁時計時間
  dataset_id: string;
  shape_id: string;
  primary_effect_id: string;
  primary_value_rank: number;
  secondary_effect_id: string | null;
  secondary_value_rank: number | null;
  curse_id: string;
  target_match: boolean;
  // このgem自身(の組み合わせぴったり)が出る正確な確率p(computeGemProbability由来)。
  // coin_costがdrawそのものの確率に依存するため、監査・再計算用に保存する。
  gem_probability_exact: number;
  // -log2(gem_probability_exact)。coin_cost式(surprisal系)が直接使う量そのもの。
  gem_surprisal_bits: number;
  coin_cost: number | null; // コインコスト式が未確定のため、実装されるまでは常にnull
  coin_remaining_after_draw: number | null; // 同上
  // このdrawのcoin_costがどのモデル/バージョンで計算されたか(coin_cost自体がnullの間はnull)。
  coin_cost_model_version: string | null;
  draw_detail_schema_version: number;
}

// IndexedDBの keyPath として使う複合キー。experiment_id+draw_indexの一意性をそのまま表す。
function makeId(experimentId: string, drawIndex: number): string {
  return `${experimentId}::${drawIndex}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex(EXPERIMENT_INDEX, "experiment_id", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

// 1件のvisible drawをidempotentに保存する(同じexperiment_id+draw_indexへの再書き込みは上書きになる)。
// IndexedDBへの書き込み失敗は研究データの記録失敗としては致命的だが、UIをクラッシュさせないよう
// 呼び出し側でcatchできるようPromiseを返す(失敗を握りつぶさない)。
export async function appendDraw(record: ResearchDrawRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: makeId(record.experiment_id, record.draw_index), ...record });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}

export async function listDrawsForExperiment(experimentId: string): Promise<ResearchDrawRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index(EXPERIMENT_INDEX);
    const req = index.getAll(IDBKeyRange.only(experimentId));
    req.onsuccess = () => {
      const rows = (req.result as (ResearchDrawRecord & { id: string })[]).sort((a, b) => a.draw_index - b.draw_index);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
}

export async function countDrawsForExperiment(experimentId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index(EXPERIMENT_INDEX);
    const req = index.count(IDBKeyRange.only(experimentId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB count failed"));
  });
}

// resume時に「どこまで確定していたか」をResearchDraws自体(正本)から復元するための補助。
// 記録が1件も無ければnullを返す(=roll_offset/batch_offset/active_elapsed_msはすべて0からでよい)。
export async function getLastDrawForExperiment(experimentId: string): Promise<ResearchDrawRecord | null> {
  const rows = await listDrawsForExperiment(experimentId);
  return rows.length > 0 ? rows[rows.length - 1] : null;
}

// テスト・開発時のリセット用。本番UIからは通常呼ばない。
export async function deleteDrawsForExperiment(experimentId: string): Promise<void> {
  const db = await openDb();
  const rows = await listDrawsForExperiment(experimentId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const row of rows) store.delete(makeId(row.experiment_id, row.draw_index));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
}

// テスト専用: モジュールキャッシュされたDB接続をリセットする(fake-indexeddbをテストごとに
// 差し替えるため)。本番コードからは呼ばない。
export function __resetDbConnectionForTests(): void {
  dbPromise = null;
}
