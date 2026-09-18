// Google Apps Script(研究データ受信endpoint)への送信層(Experiments)。
//
// 重要:
// - ビルド時に環境変数 VITE_RESEARCH_ENDPOINT が設定されていない限り、
//   このモジュールは一切のネットワークアクセスを行わず、常に "local_only" を返す。
// - endpoint URL自体はユーザーから明示提供された公開情報(秘密鍵ではない)であり、
//   app/web/.env.production にそのまま書いてある(GitHub Pagesのproduction buildにも
//   同じ値が埋め込まれる)。
// - POST bodyは`{ request_type: "experiment", schema_version: "experiment-v3", payload: {...} }`
//   というenvelopeにする(docs/apps_script_v3_spec.md 2節)。ResearchDraws(研究データ受信endpoint)と
//   同一URLを`request_type`で区別するための形式。
// - ローカル保存(storage/researchHistory.ts)が必ず送信より先に行われる前提のオーケストレーション
//   (attemptSubmission / retryAllPendingSubmissions)もここに集約する。
//   送信の成否に関わらず、研究データそのものはlocalStorageに残り続ける。

import * as researchStore from "../storage/researchHistory";
import type { ResearchExperiment, SubmissionStatus } from "../storage/researchHistory";
import { buildExperimentSubmissionPayload } from "./submissionDto";
import { isEndpointConfigured, postToAppsScript } from "./appsScriptEndpoint";

export type SubmissionOutcome = { status: "local_only" } | { status: "sent" } | { status: "failed"; error: string };

export const EXPERIMENT_SCHEMA_VERSION = "experiment-v3";

export function isSubmissionConfigured(): boolean {
  return isEndpointConfigured();
}

// Apps Scriptのレスポンス本文を検証する。HTTPレベルで200が返っただけでは成功とみなさない:
// Apps Scriptはvalidation failure等でもHTTP 200で{ok:false, error:"..."}を返すため
// (例: experiment_validation_failed)、json.ok===trueであることを明示的に確認する。
// duplicate:trueもok:trueなのでsent扱いでよい(既存experiment_idの再送を示すだけで失敗ではない)。
function parseExperimentAck(json: unknown): { ok: boolean; error?: string } | null {
  if (!json || typeof json !== "object") return null;
  const { ok, error } = json as Record<string, unknown>;
  if (typeof ok !== "boolean") return null;
  return { ok, error: typeof error === "string" ? error : undefined };
}

// endpointが未設定ならネットワークアクセスなしで"local_only"を返す。
// endpoint設定済みなら実際にPOSTし、成功/失敗を返す(ここではlocalStorageを更新しない)。
export async function submitExperiment(experiment: ResearchExperiment): Promise<SubmissionOutcome> {
  if (!isEndpointConfigured()) {
    return { status: "local_only" };
  }

  const payload = buildExperimentSubmissionPayload(experiment);
  const result = await postToAppsScript({
    request_type: "experiment",
    schema_version: EXPERIMENT_SCHEMA_VERSION,
    payload,
  });
  if (!result.ok) {
    return { status: "failed", error: result.error };
  }

  const ack = parseExperimentAck(result.json);
  if (!ack || ack.ok !== true) {
    return { status: "failed", error: ack?.error ?? "invalid or missing acknowledgement from Apps Script" };
  }
  return { status: "sent" };
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
