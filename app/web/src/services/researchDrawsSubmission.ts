// Google Apps Script(研究データ受信endpoint)への送信層(ResearchDraws)。
//
// ExperimentsとResearchDrawsは同一URLへ、`request_type`で区別してPOSTする
// (docs/apps_script_v3_spec.md 2節)。1 drawごとにHTTP通信はせず、IndexedDBへローカル保存済みの
// visible drawをchunk化してまとめて送信する(3節・5節)。
//
// dedupeの正本は`experiment_id + draw_index`の複合キーであり、chunk_idそのものではない
// (Apps Script側がchunk内の各rowをこのキーで判定する)。それでも、途中chunkだけが失敗した
// 状態でタブが閉じられた場合に毎回全件を送り直すのは非現実的なコストになりうるため、
// 「どこまでack済みか」をresearchDrawsSyncStatus.ts(ブラウザ内のみの永続化。
// Experiments側のsubmission_statusやSheets側のdraw_detail_statusとは別物)へ記録し、
// 次回はその続きから再送する。chunkの成功条件は`received === inserted + duplicates`
// (docs/apps_script_v3_spec.md 8節3項)であり、HTTPレベルで200が返っただけでは
// 成功とみなさない。万一ローカルの進捗記録とサーバーの実態がズレても、
// dedupeキーによりサーバー側で安全に吸収される。

import { listDrawsForExperiment } from "../storage/researchDrawsDb";
import type { ResearchDrawRecord } from "../storage/researchDrawsDb";
import { isEndpointConfigured, postToAppsScript } from "./appsScriptEndpoint";
import { getResearchDrawsSyncStatus, saveResearchDrawsSyncStatus } from "../storage/researchDrawsSyncStatus";
import type { ResearchDrawsSyncState } from "../storage/researchDrawsSyncStatus";

export const RESEARCH_DRAWS_SCHEMA_VERSION = "research-draw-v2";
// 通常のchunkサイズ(docs/apps_script_v3_spec.md 3節: 通常250 / 上限500)。
export const RESEARCH_DRAWS_CHUNK_SIZE = 250;

export type ResearchDrawsSyncOutcome =
  | { status: "local_only" }
  | { status: "synced"; chunkCount: number; drawCount: number }
  | { status: "failed"; error: string; chunkIndex: number; chunkCount: number };

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function buildChunkId(experimentId: string, rows: ResearchDrawRecord[]): string {
  const first = rows[0].draw_index;
  const last = rows[rows.length - 1].draw_index;
  return `${experimentId}:${first}-${last}`;
}

interface ChunkAck {
  received: number;
  inserted: number;
  duplicates: number;
}

// Apps Scriptのレスポンス形状を検証する(docs/apps_script_v3_spec.md 4節)。
// 形が壊れている場合は「成功と確認できない」ものとして扱う(nullを返す)。
function parseChunkAck(json: unknown): ChunkAck | null {
  if (!json || typeof json !== "object") return null;
  const { received, inserted, duplicates } = json as Record<string, unknown>;
  if (typeof received !== "number" || typeof inserted !== "number" || typeof duplicates !== "number") return null;
  return { received, inserted, duplicates };
}

// IndexedDBの内部keyPath("id"、experiment_id::draw_index)は送信ペイロードへ含めない。
// フィールドを明示的に列挙することで、将来ResearchDrawRecordへ内部専用フィールドが
// 増えてもそのまま漏れ出さないようにする。
function toWireDraw(row: ResearchDrawRecord) {
  return {
    experiment_id: row.experiment_id,
    draw_index: row.draw_index,
    batch_index: row.batch_index,
    active_elapsed_ms: row.active_elapsed_ms,
    wall_elapsed_ms: row.wall_elapsed_ms,
    dataset_id: row.dataset_id,
    shape_id: row.shape_id,
    primary_effect_id: row.primary_effect_id,
    primary_value_rank: row.primary_value_rank,
    secondary_effect_id: row.secondary_effect_id,
    secondary_value_rank: row.secondary_value_rank,
    curse_id: row.curse_id,
    target_match: row.target_match,
    gem_probability_exact: row.gem_probability_exact,
    gem_surprisal_bits: row.gem_surprisal_bits,
    coin_cost: row.coin_cost,
    coin_remaining_after_draw: row.coin_remaining_after_draw,
    coin_cost_model_version: row.coin_cost_model_version,
    draw_detail_schema_version: row.draw_detail_schema_version,
  };
}

export function isResearchDrawsSubmissionConfigured(): boolean {
  return isEndpointConfigured();
}

// 指定experiment_idについて、ローカルに記録済みの未送信visible drawだけをchunk送信する。
// endpoint未設定ならネットワークアクセスなしで"local_only"を返す。
// 「どこまで送信済みか」はresearchDrawsSyncStatus.tsへexperiment_id単位で永続化しており、
// 前回の呼び出しでack済みのdraw_indexより後ろだけを対象にする(再起動を跨いでも再開できる)。
// chunkのどこかで失敗した場合、それ以降のchunkは送らず即座に失敗を返す
// (次回呼び出し時は失敗したchunk以降だけを送り直す。dedupeにより重複行を作ることはない)。
export async function syncResearchDrawsForExperiment(experimentId: string): Promise<ResearchDrawsSyncOutcome> {
  if (!isEndpointConfigured()) {
    return { status: "local_only" };
  }

  const rows = await listDrawsForExperiment(experimentId);
  const syncedThroughAtStart = getResearchDrawsSyncStatus(experimentId)?.synced_through_draw_index ?? 0;
  let syncedThrough = syncedThroughAtStart;

  function persist(state: ResearchDrawsSyncState, error: string | null): void {
    saveResearchDrawsSyncStatus({
      experiment_id: experimentId,
      state,
      synced_through_draw_index: syncedThrough,
      last_error: error,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    persist("synced", null);
    return { status: "synced", chunkCount: 0, drawCount: 0 };
  }

  const unsent = rows.filter((row) => row.draw_index > syncedThroughAtStart);
  if (unsent.length === 0) {
    // 前回までの呼び出しで、記録済みの全drawが既にack済み(=完了済み)。
    persist("synced", null);
    return { status: "synced", chunkCount: 0, drawCount: 0 };
  }

  const chunks = chunkArray(unsent, RESEARCH_DRAWS_CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // eslint-disable-next-line no-await-in-loop
    const result = await postToAppsScript({
      request_type: "research_draws_chunk",
      schema_version: RESEARCH_DRAWS_SCHEMA_VERSION,
      experiment_id: experimentId,
      chunk_id: buildChunkId(experimentId, chunk),
      draws: chunk.map(toWireDraw),
    });

    if (!result.ok) {
      persist("failed", result.error);
      return { status: "failed", error: result.error, chunkIndex: i, chunkCount: chunks.length };
    }

    // chunk成功条件は`received === inserted + duplicates`(docs/apps_script_v3_spec.md 8節3項)。
    // HTTP 200が返っただけでは成功とみなさず、この等式が確認できて初めてsynced_through_draw_indexを
    // 前進させる(進めなければ、次回呼び出し時にこのchunkから送り直される)。
    const ack = parseChunkAck(result.json);
    if (!ack || ack.received !== ack.inserted + ack.duplicates) {
      const error = ack
        ? `chunk response inconsistent: received=${ack.received} inserted=${ack.inserted} duplicates=${ack.duplicates}`
        : "invalid chunk response (missing received/inserted/duplicates)";
      persist("failed", error);
      return { status: "failed", error, chunkIndex: i, chunkCount: chunks.length };
    }

    syncedThrough = chunk[chunk.length - 1].draw_index;
    // まだ残りchunkがあるかもしれない時点でのcheckpoint。ここでタブが閉じられても、
    // 次回はsynced_through_draw_indexより後ろだけを送り直せばよい。
    persist(i === chunks.length - 1 ? "synced" : "in_progress", null);
  }

  return { status: "synced", chunkCount: chunks.length, drawCount: unsent.length };
}
