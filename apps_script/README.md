# Apps Script(研究データ受信endpoint)

`Code.gs`は、実際に稼働しているGoogle Apps Scriptプロジェクトの現行`Code.gs`(2026-09-18時点でユーザーが提供)をベースに、v3(request_type routing・ResearchDraws受信・派生式のheader名解決)を統合したものです。**このリポジトリのコードから自動的にデプロイされることはありません**。GoogleのApps Scriptエディタへ手動でコピーし、下記の確認手順を終えてからご自身でデプロイしてください。

## デプロイ前に必ず確認すること

### 1. success_cdf_at_roll / survival_probability_at_cutoff の参照列(最重要)

既存の`Code.gs`はこの2列を`setFormulaR1C1`によるR1C1相対参照(例: `RC[-7]`, `RC[-5]`, `RC[-2]`)で計算しています。v3で新規列を右側に追加してもこの相対参照自体が壊れることは無いはずですが(参照先はすべて既存43列の内側にあるため)、ユーザーからの明示的な指示により、より堅牢なheader名ベースの絶対参照方式へ書き換えました。

このとき`RC[-7]`等が実際にどの列名を指していたかは、**旧式の数式構造(`1-(1-p)^n` / `(1-p)^n`という2項分布の式)と、クライアント側`ResearchExperiment`型の既存フィールド名から再構成した推測**であり、実際のヘッダー行そのものと突き合わせて確認したものではありません。`Code.gs`冒頭の定数`PROBABILITY_FIELD` / `CDF_BOOLEAN_FIELD` / `CDF_ROLL_COUNT_FIELD` / `SURVIVAL_BOOLEAN_FIELD` / `SURVIVAL_CUTOFF_FIELD`がこの再構成結果です。

**デプロイ前に、Apps Scriptエディタで以下2つの関数を実行して確認してください(どちらも読み取り専用、書き込みは一切ありません)**:

1. `printDerivedFormulaFieldNames()` — 実際のヘッダー行から、旧R1C1参照が指している列名をLoggerへ出力します。上記5定数と一致するか目視確認してください。
2. `verifyDerivedFormulaMigration()` — 既存行について、現在シートに表示されている値(旧式の計算結果)と、新しいheader名ベースのロジックで計算した値を突き合わせ、不一致があればLoggerへ出力します。`mismatches = 0`になることを確認してください。

両方で問題が無いことを確認できて初めて、この`Code.gs`を反映してください。もし不一致があれば、5定数の値をLoggerの出力に合わせて修正してから再度実行してください。

### 2. 新規: request_type="experiment"のv3 envelopeに対する厳格validation

本番Sheetで、`experiment_id`/`submission_status`/`submitted_at`だけが埋まり他のフィールドが空欄の不完全な行が複数発生していた問題への対応です。`doPost`は`request_type: "experiment"`のリクエストについてのみ、`EXPERIMENT_REQUIRED_KEYS`(34key。`Code.gs`冒頭で定義)がすべて**存在すること**(値がnullであることは許容する)を書き込み前に検証します。1つでも欠落していれば1セルも書き込まず、`{ok:false, error:"experiment_validation_failed", missing_fields:[...]}`を返します。

**`request_type`が無いlegacy POST(既存pilot dataを送っていた旧クライアント)にはこの厳格validationを適用しません**(後方互換。従来どおり`experiment_id`のみ必須)。

ResearchDraws側にも同様の趣旨で以下を追加しています:
- chunk sizeの上限500を超えたら`chunk_too_large`で拒否する。
- `body.experiment_id`と各`draw.experiment_id`が一致しない場合、そのrowを不正として扱いchunk全体を失敗させる(誤った実験へのデータ混入防止)。
- `draw_index`は正の整数であることを検証する(旧: 数値であることのみ)。

これらは`apps_script/Code.test.js`(Node組み込みの`node:test`。GASグローバルをスタブ化したサンドボックスで実行)でカバーされています。`node --test apps_script/Code.test.js`で実行できます。

### 3. その他の確認事項

- 新規`ResearchDraws`シートを作成する処理を含みますが、実際にデプロイ前に一度テスト用のスプレッドシートで動作確認することを推奨します。
- Spreadsheetのtimezone変更(`America/Los_Angeles` → `Asia/Tokyo`)は、このスクリプトの範囲外です(Apps Scriptの設定またはスプレッドシートの「ファイル > 設定」から手動で行ってください)。
- `appsscript.json`(マニフェスト)の変更は不要です。このスクリプトは`SpreadsheetApp` / `LockService` / `ContentService` / `Logger`のみを使っており、いずれも追加のOAuthスコープ宣言やトリガー設定を必要としない標準サービスです。既存プロジェクトに手動編集済みのマニフェストが無い場合、新たに作成する必要もありません。
- **既存Sheetsの行は一切変更・削除・backfillしません**。今回のvalidation追加は新規POSTにのみ適用され、既に書き込まれている不完全な行(experiment_id/submission_status/submitted_atのみの空行を含む)はそのまま残ります。これらはpilot/incompleteなデータとして扱ってください(`docs/handoff.md`参照)。

## デプロイ手順(概要)

1. Google Apps Scriptエディタで既存プロジェクトを開く。
2. 既存`Code.gs`の内容をバックアップ(コピー)してから、この`Code.gs`の内容で置き換える。
3. 上記「1. success_cdf_at_roll / survival_probability_at_cutoff の参照列」の2関数を実行し、問題が無いことを確認する。
4. テスト用スプレッドシートで`doPost`の動作を確認する(Experiments・ResearchDrawsの両方。request_type無しの旧形式POSTも壊れていないこと、不完全なv3 payloadが拒否されることを含む)。
5. 問題なければ本番スプレッドシートへ適用し、**新しいデプロイメント**を作成する(コード変更だけではWebアプリURLへ反映されない)。

## 実物との差分の要点

- Experimentsの既存ロジック(`SPREADSHEET_ID`への`openById`、`experiment_id`によるTextFinder重複検知(重複時は上書きせず`duplicate:true`を返すのみ)、空き行への書き込み、`submission_status`/`submitted_at`の自動設定、`safeValue_`によるformula injection対策、`LockService`)はすべてそのまま維持しています。
- `doPost`の先頭で`request_type`を見て、`"research_draws_chunk"`なら新設の`handleResearchDrawsChunk_`へ、`"experiment"`ならv3厳格validation(上記2節)を経て`handleExperiment_`へ、`request_type`が無い旧POSTはvalidationなしでそのまま`handleExperiment_`へルーティングします。
- `EXPERIMENT_V3_COLUMNS`は`docs/apps_script_v3_spec.md`の候補列から、実際には存在しない2列(`coin_cost_model_version`・`draw_detail_schema_version`。ResearchDraws側の列であり、Experimentsの列ではない)を除外し、`initial_coin`を実際のフィールド名`coin_initial`に修正しています(この修正は`docs/apps_script_v3_spec.md`側にも反映済みです)。
- ResearchDrawsの書き込みにも`safeValue_`を適用しています(旧リファレンス実装では未適用でした)。

## クライアント側の対応状況

`app/web`側は本仕様に対応済み:

- `services/researchSubmission.ts`: Experimentsを`{ request_type: "experiment", schema_version: "experiment-v3", payload: {...} }`のenvelopeで送信。
- `services/researchDrawsSubmission.ts`: ResearchDrawsを`{ request_type: "research_draws_chunk", schema_version: "research-draw-v2", experiment_id, chunk_id, draws: [...] }`のenvelopeで、250件/chunkに分割して送信。レスポンスの`received === inserted + duplicates`をクライアント側でも検証し、`storage/researchDrawsSyncStatus.ts`(ブラウザ内のみ)へ送信進捗を永続化する。

詳細は`docs/apps_script_v3_spec.md`を参照してください。
