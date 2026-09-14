import { beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  deleteAllHistory,
  exportSessionsAsCSV,
  exportSessionsAsJSON,
  getSession,
  listSessions,
  recordBatchSummary,
} from "./simulationHistory";

const BASE_TARGET = {
  shape: ["radial"],
  primary_effect_id: "physical",
  primary_allowed_ranks: [17, 18, 19],
  secondary_effect_id: null,
  secondary_allowed_ranks: null,
  accepted_curse_ids: ["stamina_cost_up"],
};

function makeSession(sessionId: string) {
  return createSession({
    sessionId,
    enemyId: "merciless_watchers",
    enemyDisplayName: "3デブ",
    datasetId: "pthumeru_depth5_standard_watchers_v0_1",
    target: BASE_TARGET,
    targetSummary: "物理攻撃力UP / 呪い1種",
    theoreticalProbability: 0.1258,
  });
}

describe("storage/simulationHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("createSessionは合計0件のsessionを作成する(個々のdrawは保存しない)", () => {
    const result = makeSession("s1");
    expect(result.ok).toBe(true);

    const session = getSession("s1");
    expect(session).not.toBeNull();
    expect(session?.total_draws).toBe(0);
    expect(session?.batch_count).toBe(0);
    expect(session?.match_count).toBe(0);
    expect((session as unknown as { draws?: unknown }).draws).toBeUndefined();
  });

  it("recordBatchSummaryは要約(件数・一致数)だけを積算する", () => {
    makeSession("s1");
    recordBatchSummary("s1", 10, 2);
    recordBatchSummary("s1", 10, 0);

    const session = getSession("s1");
    expect(session?.total_draws).toBe(20);
    expect(session?.batch_count).toBe(2);
    expect(session?.match_count).toBe(2);
  });

  it("reload相当(localStorageの再読み込み)でも履歴が残る", () => {
    makeSession("s1");
    recordBatchSummary("s1", 10, 1);

    // storage関数はインメモリキャッシュを持たず、常にlocalStorageから読み直すため、
    // 新しく呼び出すこと自体が「reload後の再読み込み」と等価になる。
    const sessionsAfterReload = listSessions();
    expect(sessionsAfterReload).toHaveLength(1);
    expect(sessionsAfterReload[0].total_draws).toBe(10);
  });

  it("listSessionsは新しい順に返す", () => {
    makeSession("s1");
    makeSession("s2");
    const sessions = listSessions();
    expect(sessions.map((s) => s.session_id)).toEqual(["s2", "s1"]);
  });

  it("deleteAllHistoryで全件消える", () => {
    makeSession("s1");
    const result = deleteAllHistory();
    expect(result.ok).toBe(true);
    expect(listSessions()).toHaveLength(0);
  });

  it("exportSessionsAsJSON/CSVが正しい形式で出力される(1 session = 1 row)", () => {
    makeSession("s1");
    recordBatchSummary("s1", 10, 3);

    const json = JSON.parse(exportSessionsAsJSON());
    expect(json).toHaveLength(1);
    expect(json[0].session_id).toBe("s1");

    const csv = exportSessionsAsCSV();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[0]).toContain("session_id");
    expect(lines[1]).toContain("s1");
    expect(lines[1]).toContain("3"); // match_count
  });
});
