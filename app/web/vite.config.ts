import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// motsuyoku-sensor-core は npm workspaces でリンクされた素のJS ESMパッケージ（ビルド成果物なし）。
// Vite はワークスペース内のソースとして直接扱えるため、特別な設定は不要。
//
// GitHub Pages(プロジェクトサイト)は https://<user>.github.io/<repo>/ 配下で配信されるため、
// asset参照を解決するには base を "/<repo名>/" にする必要がある。
// ここではrepo名をハードコードせず、GitHub Actions側から渡す環境変数 GITHUB_PAGES_BASE
// （ワークフロー内で ${{ github.event.repository.name }} を注入する想定）でのみ切り替える。
// ローカルの npm run dev / npm run build ではこの変数は設定されないため、
// 従来どおり base="/"（localhost用の絶対パス相当）のまま変わらない。
const githubPagesBase = process.env.GITHUB_PAGES_BASE;

export default defineConfig({
  base: githubPagesBase ? `/${githubPagesBase}/` : "/",
  plugins: [react()],
});
