/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 将来のGoogle Sheets等への研究データ送信先。未設定の場合はsubmission_status="local_only"のまま。
  readonly VITE_RESEARCH_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
