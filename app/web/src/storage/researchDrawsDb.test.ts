import { describe, expect, it } from "vitest";
import {
  appendDraw,
  countDrawsForExperiment,
  DRAW_DETAIL_SCHEMA_VERSION,
  deleteDrawsForExperiment,
  getLastDrawForExperiment,
  listDrawsForExperiment,
  type ResearchDrawRecord,
} from "./researchDrawsDb";

function makeDraw(overrides: Partial<ResearchDrawRecord> = {}): ResearchDrawRecord {
  return {
    experiment_id: "exp-1",
    draw_index: 1,
    batch_index: 1,
    active_elapsed_ms: 1000,
    wall_elapsed_ms: 1000,
    dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
    shape_id: "radial",
    primary_effect_id: "physical",
    primary_value_rank: 18,
    secondary_effect_id: null,
    secondary_value_rank: null,
    curse_id: "stamina_cost_up",
    target_match: false,
    gem_probability_exact: 0.05,
    gem_surprisal_bits: 4.32,
    coin_cost: null,
    coin_remaining_after_draw: null,
    coin_cost_model_version: null,
    draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("storage/researchDrawsDb", () => {
  // IndexedDBのfake実装への差し替え・DB接続キャッシュのリセットはsrc/testSetup.ts(グローバル)が
  // 毎テスト前に行うため、ここでは何もしなくてよい。

  it("appendDraw/listDrawsForExperimentで、保存した順(draw_index順)にvisible drawだけ読み出せる", async () => {
    await appendDraw(makeDraw({ draw_index: 2 }));
    await appendDraw(makeDraw({ draw_index: 1 }));
    await appendDraw(makeDraw({ draw_index: 3, experiment_id: "exp-other" }));

    const rows = await listDrawsForExperiment("exp-1");
    expect(rows.map((r) => r.draw_index)).toEqual([1, 2]);
  });

  it("同一experiment_id+draw_indexへの再書き込みはidempotent(重複行を生まず上書きになる)", async () => {
    await appendDraw(makeDraw({ draw_index: 5, target_match: false }));
    await appendDraw(makeDraw({ draw_index: 5, target_match: true })); // 再送・再チェックポイントを模擬

    const rows = await listDrawsForExperiment("exp-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].target_match).toBe(true);
  });

  it("countDrawsForExperimentは実験ごとの正確な件数を返す(resumeのroll_offset算出に使う)", async () => {
    await appendDraw(makeDraw({ draw_index: 1 }));
    await appendDraw(makeDraw({ draw_index: 2 }));
    await appendDraw(makeDraw({ draw_index: 3 }));
    expect(await countDrawsForExperiment("exp-1")).toBe(3);
    expect(await countDrawsForExperiment("exp-none")).toBe(0);
  });

  it("getLastDrawForExperimentは記録がなければnull、あれば最後の(draw_indexが最大の)行を返す", async () => {
    expect(await getLastDrawForExperiment("exp-1")).toBeNull();
    await appendDraw(makeDraw({ draw_index: 1, active_elapsed_ms: 400, batch_index: 1 }));
    await appendDraw(makeDraw({ draw_index: 2, active_elapsed_ms: 900, batch_index: 1 }));
    const last = await getLastDrawForExperiment("exp-1");
    expect(last?.draw_index).toBe(2);
    expect(last?.active_elapsed_ms).toBe(900);
  });

  it("deleteDrawsForExperimentは指定したexperiment_idの行だけを削除する", async () => {
    await appendDraw(makeDraw({ draw_index: 1, experiment_id: "exp-a" }));
    await appendDraw(makeDraw({ draw_index: 1, experiment_id: "exp-b" }));
    await deleteDrawsForExperiment("exp-a");
    expect(await countDrawsForExperiment("exp-a")).toBe(0);
    expect(await countDrawsForExperiment("exp-b")).toBe(1);
  });

  it("Target Match後に破棄された(=参加者に見せなかった)drawはそもそもappendDrawが呼ばれないため保存されない", async () => {
    // このテストはDB層自体の挙動というより、呼び出し契約の確認:
    // 「1 visible draw = 1 record」を守るのは呼び出し側(useResearchSession)の責務であり、
    // ここでは「渡されたものだけを保存する」ことだけを保証する。
    await appendDraw(makeDraw({ draw_index: 7, target_match: true }));
    const rows = await listDrawsForExperiment("exp-1");
    expect(rows).toHaveLength(1); // #8以降(内部生成されたが見せなかった分)は呼び出されていないので存在しない
  });
});
