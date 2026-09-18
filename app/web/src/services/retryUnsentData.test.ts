import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// retryAllPendingSubmissions/retryAllUnsyncedResearchDrawsの実装自体は
// researchSubmission.test.ts/researchDrawsSubmission.test.tsで検証済みのため、
// ここではretryUnsentData.ts自身の責務(offlineガード・両方の独立呼び出し)だけを検証する。
const mocks = vi.hoisted(() => ({
  retryAllPendingSubmissions: vi.fn(async () => {}),
  retryAllUnsyncedResearchDraws: vi.fn(async () => {}),
}));

vi.mock("./researchSubmission", () => ({
  retryAllPendingSubmissions: mocks.retryAllPendingSubmissions,
}));
vi.mock("./researchDrawsSubmission", () => ({
  retryAllUnsyncedResearchDraws: mocks.retryAllUnsyncedResearchDraws,
}));

describe("services/retryUnsentData", () => {
  beforeEach(() => {
    mocks.retryAllPendingSubmissions.mockClear();
    mocks.retryAllUnsyncedResearchDraws.mockClear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("オンライン時は、Experiments/ResearchDrawsの両方の再送を独立して呼ぶ", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const { retryAllUnsentResearchData } = await import("./retryUnsentData");

    await retryAllUnsentResearchData();

    expect(mocks.retryAllPendingSubmissions).toHaveBeenCalledTimes(1);
    expect(mocks.retryAllUnsyncedResearchDraws).toHaveBeenCalledTimes(1);
  });

  it("offline時は無理に送信せず、どちらの再送も呼ばない(local-firstで保持)", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { retryAllUnsentResearchData } = await import("./retryUnsentData");

    await retryAllUnsentResearchData();

    expect(mocks.retryAllPendingSubmissions).not.toHaveBeenCalled();
    expect(mocks.retryAllUnsyncedResearchDraws).not.toHaveBeenCalled();
  });

  it("isOnlineはnavigator.onLine===falseの場合のみfalseを返す(navigator自体が無い環境ではtrue扱い)", async () => {
    const { isOnline } = await import("./retryUnsentData");

    vi.stubGlobal("navigator", { onLine: true });
    expect(isOnline()).toBe(true);

    vi.stubGlobal("navigator", { onLine: false });
    expect(isOnline()).toBe(false);
  });
});
