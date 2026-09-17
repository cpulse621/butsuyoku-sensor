// Google Apps Script(研究データ受信endpoint)への共通設定。
// ExperimentsとResearchDrawsは同一のWebアプリURLへ、`request_type`で区別してPOSTする
// (docs/apps_script_v3_spec.md 2節)。endpoint未設定時の挙動(ネットワークアクセスなし)を
// 一箇所にまとめ、researchSubmission.ts / researchDrawsSubmission.tsの両方から使う。

export function getConfiguredEndpoint(): string | null {
  // import.meta.env.VITE_* はViteのビルド時に静的に埋め込まれる。
  const endpoint = import.meta.env.VITE_RESEARCH_ENDPOINT;
  return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
}

export function isEndpointConfigured(): boolean {
  return getConfiguredEndpoint() !== null;
}

// Apps Scriptへの不要なCORS preflightを避けるため、Content-Typeは"text/plain;charset=UTF-8"を
// 使う(application/jsonは使わない)。bodyはJSON文字列のまま。
export async function postToAppsScript(body: unknown): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const endpoint = getConfiguredEndpoint();
  if (!endpoint) {
    return { ok: false, error: "endpoint not configured" };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    // レスポンスがJSONでない場合(またはres.json自体が無いテスト用モック等)でも、
    // HTTPレベルの成否は既に確定しているため、ここでは失敗させずjson=nullにする。
    let json: unknown = null;
    if (typeof res.json === "function") {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
