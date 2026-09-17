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

### 1. Apps Script / Google Sheets対応(未着手。次セッションの最優先事項)

**設計contractが確定済み**: リクエスト形式・chunk仕様・dedupeキー・レスポンス形式・Sheet運用・ResearchDrawsの完全性判定(draw_detail_count/draw_detail_statusの扱い含む)まで、`docs/apps_script_v3_spec.md`に合意事項として書き出してある(8節まで完結)。実装前に必ずこのファイルを読むこと(要点は以下にも再掲するが、詳細・JSON例はそちらが正)。

**現物確認済みの事実(2026-09-18時点)**:

1. Apps Script(`Code.gs`)は現在**Experiments専用**の`doPost`のみで、ResearchDraws用のルーティングは存在しない。
2. `doPost`はheaderごとに`payload[header]`を読み、`experiment_id`でdedupeして1行書き込む構造。
3. 旧Target列(shape/primary_effect_id等)が空だった原因は**確定した**: 以前のクライアントは`target`がネストしたobjectのままpayloadに含まれており、`payload.shape`等のフラットなキーが存在しなかったため。**現在の`services/submissionDto.ts`は送信前にflatten済み**なので、このDTOをそのままExperiments行の正として送信してよい(Apps Script側のExperiments処理自体は変更不要、または最小限)。
4. `success_cdf_at_roll` / `survival_probability_at_cutoff`(Sheets側の既存の派生列)は現在**R1C1の相対参照**で計算されており、v3で列を追加すると参照がずれて壊れる。**header名ベースの参照に書き換える必要がある**。実際の数式テキストが未共有のため、`apps_script/Code.gs`のリファレンス実装にはこの修正は含まれていない。
5. 既存Sheetsデータは28件前後。**変更・削除・推測backfillは一切しない**(v2以前のレコードにv3の列を後付けで埋めない)。
6. 既存Experimentsの`experiment_id`によるdedupeロジックは**維持する**(壊さない)。
7. Google Sheetsのtimezoneが現在`America/Los_Angeles`になっている。**v3の本収集を始める前に`Asia/Tokyo`へ変更する**(タイムスタンプ列の解釈がずれるため、変更後の既存行への影響有無も確認すること)。
8. Apps Script変更後は**新しいdeploymentが必要**(コード変更だけではWebアプリURLへ反映されない)。

**このラウンドで追加した成果物と、その既知のギャップ**:

- `apps_script/Code.gs`(新規): `docs/apps_script_v3_spec.md`の合意事項を書き起こした**リファレンス実装**。**実際のプロジェクトの現行`Code.gs`を直接見て差分を取ったものではない**ため、そのままデプロイせず、既存コードとのマージ・レビューが必須(`apps_script/README.md`に手順あり)。実装内容: `request_type`によるrouting(無指定は`experiment`として後方互換扱い)、Experiments用のheader名ベース読み書き(`ensureHeadersExist`で新規v3列を右側に自動追加)、ResearchDraws用の全rowバリデーション→**1件でも不正なら`setValues`を一切呼ばずchunk全体を失敗させる**書き込み、`experiment_id+draw_index`複合キーでの重複除外、`{ok, received, inserted, duplicates}`レスポンス。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`のR1C1修正は**未実装**(上記4参照)。
- クライアント側の`storage/researchDrawsSyncStatus.ts`により、「ResearchDrawsのどこまでApps Scriptへack済みか」はexperiment_id単位でlocalStorageに永続化されるようになった(2026-09-18時点で解消済み)。`App.tsx`起動時の再送は依然としてExperiments側の`submission_status`が`pending`/`failed`のexperiment_idを対象に`syncResearchDrawsForExperiment`を呼ぶヒューリスティックのままだが、その内部では未ack分のchunkだけが実際に再送される。ただし「Experimentsは送信済みだがResearchDrawsだけ未送信」というケースをApps Script側からの応答だけで自動検知して起動時にトリガーする仕組みはまだ無く、その場合は手動で`ResearchHistoryPanel`から再送するか、`getResearchDrawsSyncStatus(experimentId)`を使ってstate!=="synced"のexperiment_idを別途スキャンする対応が必要(現状は実装していない)。
- 実際のGoogle Apps Scriptエンドポイントに対する送信テストは**本ラウンドでは一切行っていない**(未レビューのスクリプトに本番研究データを送るリスクを避けるため)。ブラウザ確認は`VITE_RESEARCH_ENDPOINT`未設定(`local_only`)の状態でのみ実施し、IndexedDB上の`ResearchDraws`レコード(`coin_cost`/`coin_remaining_after_draw`/`gem_probability_exact`/`gem_surprisal_bits`等)が実値で正しく記録されることを確認した。

**ResearchDraws受信の設計要件の要点(詳細は`docs/apps_script_v3_spec.md`)**:

- POSTに`request_type`を持たせる(`"experiment"` / `"research_draws_chunk"`。`request_type`が無い旧POSTは`experiment`として後方互換的に扱う)。
- ResearchDrawsは通常250件・上限500件/requestのchunkで送る(`chunk_id`例: `<experiment_id>:1-250`)。dedupeの正本はchunk_idではなく**`experiment_id + draw_index`の複合キー**。
- 受信したchunkは1行ずつ`appendRow`せず、**まとめて`setValues`で書き込む**。書き込み前に全rowをvalidationし、1件でも不正ならchunk全体を失敗させ`setValues`自体を呼ばない(部分書き込みをしない。再送安全性のため)。
- chunk成功条件は`received === inserted + duplicates`。
- レスポンスは最低限`{ ok, received, inserted, duplicates }`を返し、クライアントが送信件数と処理件数の不一致を検知できるようにする。
- Experimentsの既存`experiment_id`単体dedupeは維持する(ResearchDrawsの複合キーdedupeとは別ロジック)。
- `draw_detail_status`は永続列として持たない。complete/incompleteはAnalysis時に`ResearchDraws`の`experiment_id`別行数と`Experiments.draw_detail_count`を突き合わせて導出する。
- 新規`ResearchDraws` tabを作成する(既存Experiments tabは変更しない)。
- 将来`research_events_chunk`等を追加できるよう`request_type`方式にしておくが、今回はResearchEventsを実装しない。

**次セッションで最初にやること(この順で進める)**:

1. `apps_script/Code.gs`を現行の実プロジェクトの`Code.gs`と突き合わせてレビュー・マージする(`apps_script/README.md`のチェックリストに従う)
2. テスト用スプレッドシートで`doPost`(Experiments・ResearchDraws両方)の動作確認
3. `success_cdf_at_roll` / `survival_probability_at_cutoff`のR1C1相対参照をheader名ベースの参照へ書き換える(実際の数式テキストを確認してから)
4. 本番スプレッドシートへ適用し、新しいdeploymentを作成
5. Spreadsheet timezoneを`America/Los_Angeles`→`Asia/Tokyo`へ変更(v3本収集前。過去のISO timestamp自体は書き換えない)
6. 実際のエンドポイントに対して`VITE_RESEARCH_ENDPOINT`を設定し、実データでのend-to-end送信確認

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
