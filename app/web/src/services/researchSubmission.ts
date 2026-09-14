// Google Sheets等の研究データベースへの将来接続用アダプタ層。
//
// 重要: 現時点でGoogle Apps Script等のendpointは存在しない。
// 存在しないURLを捏造したり、勝手に外部サービスへアクセスしたりしない。
// ビルド時に環境変数 VITE_RESEARCH_ENDPOINT が設定されていない限り、
// このモジュールは一切のネットワークアクセスを行わず、常に "local_only" を返す。
//
// 将来endpointが用意された場合は、.env(またはCIのbuild設定)に
//   VITE_RESEARCH_ENDPOINT=https://script.google.com/.../exec
// を設定するだけで、このモジュールがPOST送信を試みるようになる想定。
// 送信結果は "sent" / "failed" / "pending" 等へ拡張できるようにしてある。

import type { ResearchExperiment } from "../storage/researchHistory";

export type SubmissionOutcome = { status: "local_only" } | { status: "sent" } | { status: "failed"; error: string } | { status: "pending" };

function getConfiguredEndpoint(): string | null {
  // import.meta.env.VITE_* はViteのビルド時に静的に埋め込まれる。
  // ここでハードコードされたURLは一切存在しない。
  const endpoint = import.meta.env.VITE_RESEARCH_ENDPOINT;
  return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
}

export function isSubmissionConfigured(): boolean {
  return getConfiguredEndpoint() !== null;
}

export async function submitExperiment(experiment: ResearchExperiment): Promise<SubmissionOutcome> {
  const endpoint = getConfiguredEndpoint();
  if (!endpoint) {
    return { status: "local_only" };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
