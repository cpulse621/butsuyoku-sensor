# 引き継ぎメモ (2026-09-18時点)

次セッション開始時にまず読むための短いメモ。詳細は`docs/blood_gem_draw_engine_spec.md`・`docs/experiment_ui_flow_spec.md`を参照。

## 今のステータス

研究モード・シミュレーターモードとも実装済みで稼働中(GitHub Pages continuous deploy)。研究プロトコルは`research_protocol_version = "v3-coin"`のまま(本収集開始前の今回の修正はいずれも研究条件自体の変更ではないため、versionは変更していない)。`app_version`は`0.1.0`→`0.2.0`へ更新済み(下記「本収集開始前の最終データ完全性修正」節参照。今回の修正の前後を区別する目印)。以下がすべてproductionへ配線済み:

- Q1〜Q5事後アンケート(Q4 effort/reward fit、Q5 perceived rarity。1-2-5系列16段階＋「わからない」)
- resume(reload復旧)。roll_count/batch_count/一時停止回数/coin残高がResearchDraws(IndexedDB)を正本として復元され、0に戻らない。**2026-09-18: IndexedDBの書き込みawait化・localStorageへのcheckpoint fallback追加により、実機で確認された「reload後に0へ戻る」不具合を修正済み**(詳細は後述)
- Target表示情報(label/allowed_values)は実験開始時点(TargetがLOCKされる瞬間)のsnapshotとして固定し、以後(送信時含め)再計算しない
- ResearchDraws(IndexedDB、1 visible draw = 1 record): canonical BloodGem raw field + 確率監査用(`gem_probability_exact`/`gem_surprisal_bits`) + コイン(`coin_cost`/`coin_remaining_after_draw`/`coin_cost_model_version`)をすべて実値で記録
- コインシステム: `coin_cost = max(1, round(100 × I(g)/H(dataset)))`、`initial_coin = 100,000`。試行回数・残りコイン・使用コインを研究中常時表示。coin<=0かつTarget未達なら`termination_reason="coin_exhausted"`として事後アンケート後に直接finalize(退出理由は挟まない。participant_giveupとは区別)。同一drawでTarget Matchと同時発生した場合はTarget Matchを優先
- `researchEligible`: `expected_draws <= 1,000`を研究モードのTarget選択UIにのみ適用(`app/web/src/lib/researchEligibility.ts`)。DrawEngineの分布・Simulator modeには影響しない

DrawEngine/ProbabilityEngine(app/core)自体はこの一連の作業を通じて一切変更していない(Fidelity Contract・確率モデルは不変)。テスト: Core 44/44(`node --test`。ワークスペースの`npm test`スクリプトはNode 24環境で`node --test test/`の解釈が変わり動かないことがあるが、コード自体の問題ではない)、Web 137/137、TypeScript・productionビルドともに成功。加えて`apps_script/Code.test.js`(Node組み込み`node:test`。GASグローバルをスタブ化したサンドボックス実行、`node --test apps_script/Code.test.js`)17/17。

クライアント側のResearchDraws送信処理も実装済み: `services/researchDrawsSubmission.ts`が250件/chunkで`request_type: "research_draws_chunk"`のenvelopeを送信し、`finalize()`・`resendFinalRecord()`・`ResearchHistoryPanel`の再送に配線済み。`services/researchSubmission.ts`もExperimentsを`request_type: "experiment"`のenvelopeで送るよう変更済み(旧`request_type`無しPOSTとの後方互換はApps Script側で担保する前提)。**2026-09-18: 起動時/オンライン復帰時の自動再送は、ExperimentsとResearchDrawsを完全に独立させた(`services/retryUnsentData.ts`)**。詳細は後述。

**ResearchDraws送信進捗の永続化(2026-09-18追加)**: `services/researchDrawsSubmission.ts`はApps Scriptのレスポンスが`received === inserted + duplicates`を満たした場合のみそのchunkを成功として扱い、`storage/researchDrawsSyncStatus.ts`(localStorage、キー`butsuyoku_sensor_research_draws_sync_v1`)へexperiment_id単位で「どのdraw_indexまでack済みか」を永続化する。これはExperiments側の`submission_status`ともSheets側の`draw_detail_status`(永続フィールドとして持たない設計のまま)とも独立したブラウザ内だけの状態であり、途中chunkの失敗やタブを閉じた後の再起動を跨いでも、次回`syncResearchDrawsForExperiment`呼び出し時に未ack分のchunkだけを送り直す。HTTPが200でも上記等式が崩れていれば失敗として扱い進捗を進めない。dedupeの正本(`experiment_id + draw_index`)は引き続きサーバー側にあるため、万一ローカルの進捗がサーバーの実態とズレても安全に吸収される。

## 本収集開始前の最終データ完全性修正(2026-09-18)

実機テストと本番Sheetの確認で見つかった3系統の不具合を、本収集開始前に修正した。研究条件(確率モデル・DrawEngine・TargetMatcher)は一切変更していない。

### A. reload/resumeで試行回数が0へ戻る問題

**原因**: (1) `ResearchDraws`(IndexedDB)へのappendDraw()がfire-and-forgetで、書き込み完了を待たずに次のdrawへ進んでいた。(2) `ActiveExperimentSnapshot`(localStorage)にroll_count等のcheckpointを保存しておらず、IndexedDBの読み取りに失敗した場合に無条件で0からの再開になっていた。

**修正**(`app/web/src/hooks/useResearchSession.ts`):
- `revealBatch()`内のappendDraw()を`await`するようにし、書き込み成功が確認できたdrawについてのみUI状態(roll_count/currentBatchRevealed)とcheckpointを進める。書き込みに失敗したdrawは参加者へ見せず、その回以降のcheckpoint更新も行わない(欠番はAnalysis時にdraw_detail_countとの突き合わせで検知できる)。
- `ActiveExperimentSnapshot`に`checkpoint_draw_index`/`checkpoint_batch_index`/`checkpoint_active_elapsed_ms`/`checkpoint_coin_remaining`を追加(`app/web/src/storage/researchHistory.ts`)。これはあくまでIndexedDB read失敗時のfallbackであり、ResearchDrawsを正本とする既存方針は変えていない。
- resume時の優先順位を`buildResumeOffsets()`として明文化: (1) IndexedDBのlastDrawが読めればそれを正本とする(読めて0件だった場合も「0件」として正しく扱う)。(2) IndexedDBの**読み取り自体が失敗した場合のみ**、localStorageのcheckpointへfallbackする。(3) どちらも無ければ0。
- appendDraw失敗時はUIへ保存失敗を表示する(`researchDrawsSaveError`。`ResearchRunningLayout`・`ResearchView`に配線)。

### B. ResearchDrawsの完全自動再送

**原因**: 起動時の自動再送が、Experiments側の`submission_status`が`pending`/`failed`のexperiment_idだけを対象にResearchDrawsも再送する、という間接的なヒューリスティックだった。Experiment=sent・ResearchDraws=failedの組み合わせでは、ResearchDrawsだけが自動再送から漏れる可能性があった。

**修正**:
- `services/researchDrawsSubmission.ts`に`retryAllUnsyncedResearchDraws()`を追加。ローカルに存在する全experiment_idについて、`researchDrawsSyncStatus`が`"synced"`でなければ(未着手・in_progress・failedのいずれでも)独立して再送する。Experiments側の状態は一切参照しない。synced済みはネットワークアクセスなしでskipする。
- `services/retryUnsentData.ts`(新規)を起動時・`window`の`'online'`イベント両方から呼ぶよう`App.tsx`を配線。offline中(`navigator.onLine === false`)は無理に送信せず、何もしない(local-firstで保持。次のonlineイベントで改めて再送される)。
- `ResearchHistoryPanel`の「未送信データを再送」ボタンは非常用fallbackとしてそのまま残っている(通常運用では押す必要が無い設計になった)。
- server側dedupe(Experiment: `experiment_id`、ResearchDraws: `experiment_id + draw_index`)は変更していない。

### C. Apps Scriptで不完全Experimentを成功扱いしない

**原因**: 旧`Code.gs`は`experiment_id`さえあれば他のfieldが欠落していても空欄のまま`sent`扱いで書き込んでいた。本番Sheetで`experiment_id`/`submission_status`/`submitted_at`のみが埋まった不完全な行が複数発生していた。

**修正**(`apps_script/Code.gs`。**まだ実際のApps Scriptへは反映していない**):
- `request_type: "experiment"`のv3 envelopeのみ、`EXPERIMENT_REQUIRED_KEYS`(34key)の存在を書き込み前に検証する。keyの欠落とnull値は区別する(nullable fieldはnullでよい)。1つでも欠落していればSheetへ1セルも書き込まず、`{ok:false, error:"experiment_validation_failed", missing_fields:[...]}`を返す。
- `request_type`が無いlegacy POST(既存pilot dataの旧クライアント)にはこの厳格validationを適用しない(後方互換)。
- ResearchDraws側にも、chunk size上限(500)超過での拒否・`body.experiment_id`と各`draw.experiment_id`の不一致検出(不一致ならchunk全体失敗)・`draw_index`が正の整数であることの検証を追加した。
- **既存Sheetsの行(不完全な空行を含む)は一切変更・削除・backfillしていない**。今回の分の不完全な行はpilot/incompleteなデータとしてそのまま残る。分析時にはこれらを区別すること(`submission_status='sent'`だが主要フィールドが空、という行が該当する)。
- 検証は`apps_script/Code.test.js`(Node組み込み`node:test`)で行っている。詳細は`docs/apps_script_v3_spec.md`9節・`apps_script/README.md`参照。

### 追補: 本番反映前レビューで見つかった2つのblocker + 1つのhardening(2026-09-18続き)

上記A〜Cのcommit後のレビューで、以下を追加修正した。研究条件・確率モデル・Apps Scriptの既存仕様(重複検知・行探索・safeValue_等)は変更していない。

**D. appendDraw失敗後もCore内部のrollCount/phaseだけが進んでしまう問題**: Aの修正だけでは、appendDraw失敗時にUI/checkpointは止まるが、`session.revealNext()`は既に呼ばれておりCore内部のrollCount/phaseは進んでしまっていた(Coreは巻き戻せない)。同一Coreセッションで「次の10連」を再試行すると、絶対draw_indexに欠番ができる・Core rollCountとResearchDrawsがずれる・失敗したdrawがTarget Matchだった場合にCoreだけAWAITING_SURVEYになる、という問題があった。**修正**: `persistenceBlockedRef`を追加し、保存失敗後はそのCoreセッションを完全に停止させる(`revealBatch`・autoの自動進行・`giveUp`すべてをこのrefでブロックする。stale closureに依存しないrefベースのガード)。Core側がAWAITING_SURVEYになっていてもsurveyへは進めない。表示文言も「もう一度次の10連を押してください」から「ページを再読み込みし、『続きから』を選んでください」へ変更した(`RESEARCH_DRAWS_SAVE_FAILURE_MESSAGE`)。復帰はページ再読み込み→`resumeExperiment()`(ResearchDraws/checkpointからの復元。既存のAの仕組みでそのまま正しく動く)のみ。

**E. Apps Scriptの`ok:false`応答をsent扱いしてしまう問題**: `services/researchSubmission.ts`の`submitExperiment()`が、HTTPレベルで200が返っただけでレスポンスJSONの中身を見ずに`sent`を返していた。Apps Scriptはvalidation failure等でもHTTP 200で`{ok:false, error:"..."}`を返すため、Cの厳格validationを追加しても、クライアント側では失敗が`sent`として記録されてしまう欠陥があった。**修正**: レスポンスJSONを`parseExperimentAck()`で検証し、`json.ok === true`の場合のみ`sent`とする(`duplicate:true`も`ok:true`なので`sent`でよい)。`ok:false`・JSONがnull・JSON形状不正はいずれも`failed`とし、Apps Script側のエラー文字列があれば`SubmissionOutcome.error`へ残す。`retryAllPendingSubmissions`による事後再送は従来どおり機能する。

**F. Code.gsの未知request_type**: `request_type`が`"experiment"`/`"research_draws_chunk"`以外の未知の文字列だった場合、従来はlegacyとして`handleExperiment_`へ流れてしまう余地があった。**修正**: `request_type`が明示的に存在するが上記2値のいずれでもない場合は`{ok:false, error:"unknown_request_type"}`で拒否し、legacyとして保存しない。`request_type`が全く無い(`undefined`)場合のみ従来どおりlegacy扱いにする。

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
- 起動時/オンライン復帰時の再送オーケストレーション: `app/web/src/services/retryUnsentData.ts`
- Apps Scriptのテスト(Node組み込み`node:test`、npm workspaceには含まれない): `apps_script/Code.test.js`
