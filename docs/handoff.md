# 引き継ぎメモ (2026-09-18時点)

次セッション開始時にまず読むための短いメモ。詳細は`docs/blood_gem_draw_engine_spec.md`・`docs/experiment_ui_flow_spec.md`を参照。

## 今のステータス

研究モード・シミュレーターモードとも実装済みで稼働中(GitHub Pages continuous deploy)。研究プロトコルは`research_protocol_version = "v3-coin"`まで完了しており、以下がすべてproductionへ配線済み:

- Q1〜Q5事後アンケート(Q4 effort/reward fit、Q5 perceived rarity。1-2-5系列16段階＋「わからない」)
- resume(reload復旧)。roll_count/batch_count/一時停止回数/coin残高がResearchDraws(IndexedDB)を正本として復元され、0に戻らない
- Target表示情報(label/allowed_values)は実験開始時点(TargetがLOCKされる瞬間)のsnapshotとして固定し、以後(送信時含め)再計算しない
- ResearchDraws(IndexedDB、1 visible draw = 1 record): canonical BloodGem raw field + 確率監査用(`gem_probability_exact`/`gem_surprisal_bits`) + コイン(`coin_cost`/`coin_remaining_after_draw`/`coin_cost_model_version`)をすべて実値で記録
- コインシステム: `coin_cost = max(1, round(100 × I(g)/H(dataset)))`、`initial_coin = 100,000`。試行回数・残りコイン・使用コインを研究中常時表示。coin<=0かつTarget未達なら`termination_reason="coin_exhausted"`として事後アンケート後に直接finalize(退出理由は挟まない。participant_giveupとは区別)。同一drawでTarget Matchと同時発生した場合はTarget Matchを優先
- `researchEligible`: `expected_draws <= 1,000`を研究モードのTarget選択UIにのみ適用(`app/web/src/lib/researchEligibility.ts`)。DrawEngineの分布・Simulator modeには影響しない

DrawEngine/ProbabilityEngine(app/core)自体はこの一連の作業を通じて一切変更していない(Fidelity Contract・確率モデルは不変)。テスト: Core 44/44(`node --test`。ワークスペースの`npm test`スクリプトはNode 24環境で`node --test test/`の解釈が変わり動かないことがあるが、コード自体の問題ではない)、Web 109/109、TypeScript・productionビルドともに成功、ブラウザ実機確認済み(3draw・Target Match・survey・finalize・IndexedDB上のcoin_cost等の実値まで確認)。

クライアント側のResearchDraws送信処理も実装済み: `services/researchDrawsSubmission.ts`が250件/chunkで`request_type: "research_draws_chunk"`のenvelopeを送信し、`finalize()`・`resendFinalRecord()`・`ResearchHistoryPanel`の再送・`App.tsx`起動時のpending/failed再送ヒューリスティックに配線済み。`services/researchSubmission.ts`もExperimentsを`request_type: "experiment"`のenvelopeで送るよう変更済み(旧`request_type`無しPOSTとの後方互換はApps Script側で担保する前提)。

**ResearchDraws送信進捗の永続化(2026-09-18追加)**: `services/researchDrawsSubmission.ts`はApps Scriptのレスポンスが`received === inserted + duplicates`を満たした場合のみそのchunkを成功として扱い、`storage/researchDrawsSyncStatus.ts`(localStorage、キー`butsuyoku_sensor_research_draws_sync_v1`)へexperiment_id単位で「どのdraw_indexまでack済みか」を永続化する。これはExperiments側の`submission_status`ともSheets側の`draw_detail_status`(永続フィールドとして持たない設計のまま)とも独立したブラウザ内だけの状態であり、途中chunkの失敗やタブを閉じた後の再起動を跨いでも、次回`syncResearchDrawsForExperiment`呼び出し時に未ack分のchunkだけを送り直す。HTTPが200でも上記等式が崩れていれば失敗として扱い進捗を進めない。dedupeの正本(`experiment_id + draw_index`)は引き続きサーバー側にあるため、万一ローカルの進捗がサーバーの実態とズレても安全に吸収される。

## 次にやること(このセッションでは着手していない)

### 1. Apps Script / Google Sheets対応(実物とのレビュー・統合済み。デプロイはユーザー確認待ち)

**2026-09-18: ユーザーから実際に稼働している`Code.gs`全文の提供を受け、それを正本として`apps_script/Code.gs`を書き直した。** 以前のラウンドでは現物を見ずに`docs/apps_script_v3_spec.md`の合意事項だけから書き起こした「リファレンス実装」だったが、今回は実物のロジックをそのまま維持しつつv3を統合した、デプロイ候補と呼べる状態になっている。ただし**まだ本番へは一切反映していない**(ユーザーが確認するまで待つ、という明示の指示があるため)。

**実物のCode.gsから維持したロジック(変更していない)**:

1. `SPREADSHEET_ID`への`openById`(container-boundではなくID直指定)。
2. `experiment_id`列を`createTextFinder`+`matchEntireCell`で検索する重複検知。**重複時は上書きせず`{ok:true, duplicate:true, experiment_id}`を返すだけ**(この「上書きしない」という挙動は、以前の想定と違って重要な既存仕様だった)。
3. 「A列experiment_idが空いている最初の行」を再利用し、無ければ`insertRowAfter`で末尾に追加する行探索ロジック。
4. `headers.map(header => ...)`による、ヘッダー駆動の値構築(`submission_status`は常に`'sent'`、`submitted_at`は常にサーバー側`new Date()`で上書き、`DERIVED_FIELDS`は常にnull)。
5. `safeValue_`によるformula injection対策、`LockService`(10秒timeout、`server_busy`)、`doGet`のhealth check。

**v3として統合した差分**:

- `doPost`冒頭で`request_type`を見てrouting: `"research_draws_chunk"`なら新設`handleResearchDrawsChunk_`、それ以外(無指定 or `"experiment"`)は従来通り`handleExperiment_`。`request_type`が無い旧POST・新v3 envelope(`{request_type,schema_version,payload}`)の両方に対応。
- Experiments側は`ensureHeadersExist_`でv3列(下記2節。**`initial_coin`→`coin_initial`に修正、`coin_cost_model_version`/`draw_detail_schema_version`はResearchDraws専用のため削除**)を右側に自動追加してからheader駆動で書き込む(既存43列の削除・並べ替えなし)。
- 新規`ResearchDraws`シート(無ければ`insertSheet`で作成)。全rowバリデーション→**1件でも不正なら`setValues`を一切呼ばずchunk全体を失敗**、`experiment_id+draw_index`複合キーでの重複除外、`safeValue_`を適用したうえで`setValues`一括書き込み、`{ok, received, inserted, duplicates}`レスポンス。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`は、ユーザーから提供された実際の数式テキスト(R1C1相対参照)をもとに、header名ベースの絶対参照(`setDerivedFormulas_`)へ書き換えた。

**未解決・要ユーザー確認の1点(最重要)**: 上記の2つの派生列が実際に参照している列(旧`RC[-7]`/`RC[-5]`/`RC[-2]`/`RC[-3]`の指す先)は、数式の構造(`1-(1-p)^n`と`(1-p)^n`という2項分布のCDF/生存関数)とクライアント側`ResearchExperiment`型の既存フィールド名(`theoretical_probability`/`success`/`censored`/`roll_count`/`cutoff_draws`)から**再構成した推測**であり、実際のヘッダー行そのものとは未突き合わせ。`apps_script/Code.gs`に`printDerivedFormulaFieldNames()`(実ヘッダーから参照列名をLoggerへ出力)と`verifyDerivedFormulaMigration()`(既存行について旧式の現在値と新式の計算値を突き合わせ、書き込みは一切しない)という2つの読み取り専用の診断関数を用意したので、**デプロイ前に必ずこの2つをApps Scriptエディタで実行し、`apps_script/README.md`の該当セクションに従って確認すること**。

**上記以外に確定している事実**:

- 既存Sheetsデータは28件前後。**変更・削除・推測backfillは一切しない**(v2以前のレコードにv3の列を後付けで埋めない)。この方針は今回の統合でも守られている(既存行のヘッダー・データセルには一切書き込まない)。
- Google Sheetsのtimezoneが現在`America/Los_Angeles`になっている。**v3の本収集を始める前に`Asia/Tokyo`へ変更する**(タイムスタンプ列の解釈がずれるため、変更後の既存行への影響有無も確認すること)。このスクリプトの範囲外の作業。
- `appsscript.json`(マニフェスト)の変更は**不要**。`SpreadsheetApp`/`LockService`/`ContentService`/`Logger`のみを使っており、追加のOAuthスコープやトリガー設定を必要としない。
- Apps Script変更後は**新しいdeploymentが必要**(コード変更だけではWebアプリURLへ反映されない)。

**次にやること(この順で進める)**:

1. Apps Scriptエディタで`printDerivedFormulaFieldNames()` / `verifyDerivedFormulaMigration()`を実行し、`success_cdf_at_roll`/`survival_probability_at_cutoff`の参照列に関する上記推測が正しいか確認する(不一致があれば`Code.gs`冒頭の5定数を実際の列名に合わせて修正する)。
2. テスト用スプレッドシートで`doPost`(Experiments・ResearchDraws両方、`request_type`無しの旧形式POSTも含む)の動作確認。
3. 問題なければ`apps_script/Code.gs`を本番のCode.gsへ反映し、新しいdeploymentを作成する。
4. Spreadsheet timezoneを`America/Los_Angeles`→`Asia/Tokyo`へ変更(v3本収集前。過去のISO timestamp自体は書き換えない)。
5. 実際のエンドポイントに対して`VITE_RESEARCH_ENDPOINT`を設定し、実データでのend-to-end送信確認。

進める前に、`apps_script/Code.gs`・`apps_script/README.md`・`docs/apps_script_v3_spec.md`・本ファイルを読むこと。

### 2. Analysis拡張(未着手)

- `docs/experiment_ui_flow_spec.md`のP節(元の指示)に列挙された比較群(理論期待回数vs実際、客観的不運度vs sensor_score、coin消費vs sensor_score/effort_reward_fit_score等)。
- 分析の方向性を先に固定せず、まずraw dataの収集を優先する方針。

## 触ってはいけないもの

- `app/core`(DrawEngine/ProbabilityEngine)の確率分布・Fidelity Contract。今回追加した`computeGemProbability`/`enumerateGemProbabilities`/`computeDatasetEntropyBits`は既存ロジックの組み合わせに過ぎず、これ自体も変更対象ではない。
- 既存の`v2-*`以前のresearch_protocol_versionレコードへの推測backfill(target_label_snapshotやcoin関連フィールドが無くても補完しない)。
- `motsuyoku-sensor-core`のnpmパッケージ名・localStorageキー(`motsuyoku_sensor_*`)は互換性のため維持中。新規識別子には`butsuyoku`を使う方針(既存資産のrenameはしない)。

## 主要ファイル

- **Apps Script v3送信仕様(次セッションで最初に読む)**: `docs/apps_script_v3_spec.md`
- **Apps Scriptリファレンス実装(未レビュー、次セッションで最初にレビュー・マージする)**: `apps_script/Code.gs` / `apps_script/README.md`
- コイン計算: `app/web/src/lib/coinCost.ts`(`COIN_COST_OPTIONS`/`INITIAL_COIN`を必ずここから参照)
- researchEligible: `app/web/src/lib/researchEligibility.ts`
- 実験フロー全体: `app/web/src/hooks/useResearchSession.ts`
- ResearchDraws永続化: `app/web/src/storage/researchDrawsDb.ts`
- ResearchDraws送信進捗の永続化(ブラウザ内のみ): `app/web/src/storage/researchDrawsSyncStatus.ts`
- Experiments永続化・CSV: `app/web/src/storage/researchHistory.ts`
- 送信共通処理: `app/web/src/services/appsScriptEndpoint.ts`
- 送信DTO・Experiments送信: `app/web/src/services/submissionDto.ts` / `app/web/src/services/researchSubmission.ts`
- ResearchDraws送信: `app/web/src/services/researchDrawsSubmission.ts`
