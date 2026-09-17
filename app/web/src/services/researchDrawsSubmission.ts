// Google Apps Script(研究データ受信endpoint)への送信層(ResearchDraws)。
//
// ExperimentsとResearchDrawsは同一URLへ、`request_type`で区別してPOSTする
// (docs/apps_script_v3_spec.md 2節)。1 drawごとにHTTP通信はせず、IndexedDBへローカル保存済みの
// visible drawをchunk化してまとめて送信する(3節・5節)。
//
// dedupeの正本は`experiment_id + draw_index`の複合キーであり、chunk_idそのものではない
// (Apps Script側がchunk内の各rowをこのキーで判定する)。そのため、このモジュールは
// 「どのchunkを送信済みか」をローカルで追跡しない: 毎回そのexperiment_idの全visible drawを
// 読み直し、chunkに分けて送り直す単純な実装にしている。再送しても重複行が増えないことは
// サーバー側の冪等性に委ねる(このexperiment_id単位の再送は、通常は数百〜数千件程度で
// 十分現実的なコストに収まる想定)。

import { listDrawsForExperiment } from "../storage/researchDrawsDb";
import type { ResearchDrawRecord } from "../storage/researchDrawsDb";
import { isEndpointConfigured, postToAppsScript } from "./appsScriptEndpoint";

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

// 指定experiment_idについて、ローカルに記録済みの全visible drawをchunk送信する。
// endpoint未設定ならネットワークアクセスなしで"local_only"を返す。
// chunkのどこかで失敗した場合、それ以降のchunkは送らず即座に失敗を返す
// (再送時は最初から全chunkを送り直す。dedupeにより既に届いたchunkが重複行を作ることはない)。
export async function syncResearchDrawsForExperiment(experimentId: string): Promise<ResearchDrawsSyncOutcome> {
  if (!isEndpointConfigured()) {
    return { status: "local_only" };
  }

  const rows = await listDrawsForExperiment(experimentId);
  if (rows.length === 0) {
    return { status: "synced", chunkCount: 0, drawCount: 0 };
  }

  const chunks = chunkArray(rows, RESEARCH_DRAWS_CHUNK_SIZE);
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
      return { status: "failed", error: result.error, chunkIndex: i, chunkCount: chunks.length };
    }
    // received/inserted/duplicatesの整合確認(received === inserted + duplicates)は
    // Apps Script側の責務(docs/apps_script_v3_spec.md 8節)。クライアント側では
    // HTTPレベルの成否だけを見て、詳細な整合確認はAnalysis時にResearchDrawsの実件数と
    // Experiments.draw_detail_countを突き合わせて行う。
  }
  return { status: "synced", chunkCount: chunks.length, drawCount: rows.length };
}
