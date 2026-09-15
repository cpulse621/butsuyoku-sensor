// Google Apps Script(研究データ受信endpoint)への送信層。
//
// 重要:
// - ビルド時に環境変数 VITE_RESEARCH_ENDPOINT が設定されていない限り、
//   このモジュールは一切のネットワークアクセスを行わず、常に "local_only" を返す。
// - endpoint URL自体はユーザーから明示提供された公開情報(秘密鍵ではない)であり、
//   app/web/.env.production にそのまま書いてある(GitHub Pagesのproduction buildにも
//   同じ値が埋め込まれる)。
// - Apps Scriptへの不要なCORS preflightを避けるため、Content-Typeは
//   "text/plain;charset=UTF-8" を使う(application/jsonは使わない)。bodyはJSON文字列のまま。
// - ローカル保存(storage/researchHistory.ts)が必ず送信より先に行われる前提のオーケストレーション
//   (attemptSubmission / retryAllPendingSubmissions)もここに集約する。
//   送信の成否に関わらず、研究データそのものはlocalStorageに残り続ける。

import * as researchStore from "../storage/researchHistory";
import type { ResearchExperiment, SubmissionStatus } from "../storage/researchHistory";

export type SubmissionOutcome = { status: "local_only" } | { status: "sent" } | { status: "failed"; error: string };

function getConfiguredEndpoint(): string | null {
  // import.meta.env.VITE_* はViteのビルド時に静的に埋め込まれる。
  const endpoint = import.meta.env.VITE_RESEARCH_ENDPOINT;
  return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
}

export function isSubmissionConfigured(): boolean {
  return getConfiguredEndpoint() !== null;
}

// endpointが未設定ならネットワークアクセスなしで"local_only"を返す。
// endpoint設定済みなら実際にPOSTし、成功/失敗を返す(ここではlocalStorageを更新しない)。
export async function submitExperiment(experiment: ResearchExperiment): Promise<SubmissionOutcome> {
  const endpoint = getConfiguredEndpoint();
  if (!endpoint) {
    return { status: "local_only" };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(experiment),
    });
    if (!res.ok) {
      return { status: "failed", error: `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

// 送信を試み、結果をresearchHistoryのsubmission_statusへ反映する。
// 実験完了直後の自動送信・履歴画面からの手動再送・起動時の自動再送は、すべてこの関数を通す。
// 同じexperiment_idを何度再送しても、Apps Script側でduplicateとして扱われる前提のため、
// ここでは「再送してよいかどうか」の判断(pending/failedのみ)は呼び出し側に委ねる。
export async function attemptSubmission(experiment: ResearchExperiment): Promise<SubmissionOutcome> {
  const outcome = await submitExperiment(experiment);
  if (outcome.status !== "local_only") {
    const status: SubmissionStatus = outcome.status;
    researchStore.updateExperimentSubmissionStatus(experiment.experiment_id, status);
  }
  return outcome;
}

// アプリ起動時、未送信(pending/failed)のまま残っている実験をまとめて再送する。
// endpoint未設定なら何もしない。個々の送信はattemptSubmissionと同じ経路を通るため、
// 二重送信してもApps Script側のduplicate処理に委ねられる。
export async function retryAllPendingSubmissions(): Promise<void> {
  if (!isSubmissionConfigured()) return;
  const unsent = researchStore.listExperiments().filter((e) => e.submission_status === "pending" || e.submission_status === "failed");
  for (const experiment of unsent) {
    // eslint-disable-next-line no-await-in-loop
    await attemptSubmission(experiment);
  }
}
