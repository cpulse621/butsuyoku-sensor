# Apps Script(研究データ受信endpoint)

`Code.gs`はGoogle Apps Scriptプロジェクトのリファレンス実装です。**このリポジトリのコードから自動的にデプロイされることはありません**。GoogleのApps Scriptエディタへ手動でコピーし、レビューした上でご自身でデプロイしてください。

## デプロイ前に確認すること

- `Code.gs`は実際のプロジェクトの現物(既存Code.gs)を直接見ずに、`docs/apps_script_v3_spec.md`・`docs/handoff.md`の合意事項から書き起こしたものです。既存のExperiments処理(シート名・列の並び・既存のヘルパー関数等)と突き合わせ、差分をレビューしてください。
- 特に、既存の`success_cdf_at_roll` / `survival_probability_at_cutoff`(現在R1C1の相対参照で計算されている派生列)は、このリファレンス実装には含まれていません。実際の数式を見た上で、header名ベースの参照(またはApps Script側での計算)へ書き換える対応が別途必要です。
- 新規`ResearchDraws`シートを作成する処理は含まれていますが、実際にデプロイ前に一度テスト用のスプレッドシートで動作確認することを推奨します。
- Spreadsheetのtimezone変更(`America/Los_Angeles` → `Asia/Tokyo`)は、このスクリプトの範囲外です(Apps Scriptの設定またはスプレッドシートの「ファイル > 設定」から手動で行ってください)。

## デプロイ手順(概要)

1. Google Apps Scriptエディタで既存プロジェクトを開く。
2. 既存`Code.gs`の内容をバックアップ(コピー)してから、この`Code.gs`の内容とマージする。
3. テスト用スプレッドシートで`doPost`の動作を確認する(Experiments・ResearchDrawsの両方)。
4. 問題なければ本番スプレッドシートへ適用し、**新しいデプロイメント**を作成する(コード変更だけではWebアプリURLへ反映されない)。

## クライアント側の対応状況

`app/web`側は本仕様に対応済み:

- `services/researchSubmission.ts`: Experimentsを`{ request_type: "experiment", schema_version: "experiment-v3", payload: {...} }`のenvelopeで送信。
- `services/researchDrawsSubmission.ts`: ResearchDrawsを`{ request_type: "research_draws_chunk", schema_version: "research-draw-v2", experiment_id, chunk_id, draws: [...] }`のenvelopeで、250件/chunkに分割して送信。

詳細は`docs/apps_script_v3_spec.md`を参照してください。
