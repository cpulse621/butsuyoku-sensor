import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendDraw, DRAW_DETAIL_SCHEMA_VERSION } from "../storage/researchDrawsDb";
import type { ResearchDrawRecord } from "../storage/researchDrawsDb";

function makeDraw(overrides: Partial<ResearchDrawRecord> = {}): ResearchDrawRecord {
  return {
    experiment_id: "exp-1",
    draw_index: 1,
    batch_index: 1,
    active_elapsed_ms: 400,
    wall_elapsed_ms: 400,
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
    coin_cost: 87,
    coin_remaining_after_draw: 99913,
    coin_cost_model_version: "d-normalized-surprisal-v1",
    draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("services/researchDrawsSubmission", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("endpoint未設定ならネットワークアクセスせずlocal_onlyを返す", async () => {
    const { syncResearchDrawsForExperiment, isResearchDrawsSubmissionConfigured } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(isResearchDrawsSubmissionConfigured()).toBe(false);
    const outcome = await syncResearchDrawsForExperiment("exp-none");
    expect(outcome.status).toBe("local_only");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ローカルに記録が無いexperiment_idはHTTP通信なしでsynced(0件)を返す", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-empty");
    expect(outcome).toEqual({ status: "synced", chunkCount: 0, drawCount: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("request_type=research_draws_chunkのenvelopeでPOSTし、experiment_id+draw_indexの複合キーで送る(idの内部keyPathは含まない)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    await appendDraw(makeDraw({ draw_index: 1 }));
    await appendDraw(makeDraw({ draw_index: 2 }));
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, received: 2, inserted: 2, duplicates: 0 }) });
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-1");
    expect(outcome).toEqual({ status: "synced", chunkCount: 1, drawCount: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/exec");
    expect(options.headers["Content-Type"]).toBe("text/plain;charset=UTF-8");
    const body = JSON.parse(options.body);
    expect(body.request_type).toBe("research_draws_chunk");
    expect(body.schema_version).toBe("research-draw-v2");
    expect(body.experiment_id).toBe("exp-1");
    expect(body.chunk_id).toBe("exp-1:1-2");
    expect(body.draws).toHaveLength(2);
    expect(body.draws[0]).not.toHaveProperty("id");
    expect(body.draws[0]).toMatchObject({ experiment_id: "exp-1", draw_index: 1, coin_cost: 87 });
  });

  it("250件を超える場合、複数chunkに分割して送信する(通常chunkサイズ=250)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    for (let i = 1; i <= 300; i++) {
      // eslint-disable-next-line no-await-in-loop
      await appendDraw(makeDraw({ draw_index: i, experiment_id: "exp-big" }));
    }
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-big");
    expect(outcome).toEqual({ status: "synced", chunkCount: 2, drawCount: 300 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(firstBody.draws).toHaveLength(250);
    expect(secondBody.draws).toHaveLength(50);
    expect(firstBody.chunk_id).toBe("exp-big:1-250");
    expect(secondBody.chunk_id).toBe("exp-big:251-300");
  });

  it("途中のchunkが失敗したら、それ以降のchunkは送らず失敗を返す(再送で最初から送り直す設計)", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    for (let i = 1; i <= 300; i++) {
      // eslint-disable-next-line no-await-in-loop
      await appendDraw(makeDraw({ draw_index: i, experiment_id: "exp-fail" }));
    }
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    const fetchSpy = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }); // 1st chunk fails
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await syncResearchDrawsForExperiment("exp-fail");
    expect(outcome.status).toBe("failed");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 2つ目のchunkは送られない
  });

  it("ネットワーク例外もfailedとして扱う", async () => {
    vi.stubEnv("VITE_RESEARCH_ENDPOINT", "https://example.com/exec");
    await appendDraw(makeDraw({ experiment_id: "exp-net-error", draw_index: 1 }));
    const { syncResearchDrawsForExperiment } = await import("./researchDrawsSubmission");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const outcome = await syncResearchDrawsForExperiment("exp-net-error");
    expect(outcome.status).toBe("failed");
  });
});
