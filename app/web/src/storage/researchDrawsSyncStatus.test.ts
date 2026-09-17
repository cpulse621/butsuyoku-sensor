import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteResearchDrawsSyncStatus,
  getResearchDrawsSyncStatus,
  saveResearchDrawsSyncStatus,
} from "./researchDrawsSyncStatus";

describe("storage/researchDrawsSyncStatus", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("未保存のexperiment_idはnullを返す", () => {
    expect(getResearchDrawsSyncStatus("unknown")).toBeNull();
  });

  it("保存した内容をexperiment_id単位で取得できる(Experimentsのsubmission_statusとは別の永続化)", () => {
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-1",
      state: "in_progress",
      synced_through_draw_index: 250,
      last_error: null,
      updated_at: "2026-09-18T00:00:00.000Z",
    });
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-2",
      state: "failed",
      synced_through_draw_index: 0,
      last_error: "HTTP 500",
      updated_at: "2026-09-18T00:00:01.000Z",
    });

    expect(getResearchDrawsSyncStatus("exp-1")).toEqual({
      experiment_id: "exp-1",
      state: "in_progress",
      synced_through_draw_index: 250,
      last_error: null,
      updated_at: "2026-09-18T00:00:00.000Z",
    });
    expect(getResearchDrawsSyncStatus("exp-2")?.state).toBe("failed");
  });

  it("同じexperiment_idへの再保存は上書きになる(chunk進捗のcheckpoint更新)", () => {
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-1",
      state: "in_progress",
      synced_through_draw_index: 250,
      last_error: null,
      updated_at: "2026-09-18T00:00:00.000Z",
    });
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-1",
      state: "synced",
      synced_through_draw_index: 300,
      last_error: null,
      updated_at: "2026-09-18T00:00:02.000Z",
    });

    const status = getResearchDrawsSyncStatus("exp-1");
    expect(status?.state).toBe("synced");
    expect(status?.synced_through_draw_index).toBe(300);
  });

  it("deleteResearchDrawsSyncStatusは指定したexperiment_idの記録だけを削除する", () => {
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-1",
      state: "synced",
      synced_through_draw_index: 10,
      last_error: null,
      updated_at: "2026-09-18T00:00:00.000Z",
    });
    saveResearchDrawsSyncStatus({
      experiment_id: "exp-2",
      state: "synced",
      synced_through_draw_index: 20,
      last_error: null,
      updated_at: "2026-09-18T00:00:00.000Z",
    });

    deleteResearchDrawsSyncStatus("exp-1");

    expect(getResearchDrawsSyncStatus("exp-1")).toBeNull();
    expect(getResearchDrawsSyncStatus("exp-2")?.synced_through_draw_index).toBe(20);
  });
});
