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

DrawEngine/ProbabilityEngine(app/core)自体はこの一連の作業を通じて一切変更していない(Fidelity Contract・確率モデルは不変)。テスト: Core 43/43、Web 92/92、TypeScript・productionビルドともに成功、ブラウザ実機確認済み。

## 次にやること(このセッションでは着手していない)

### 1. Apps Script / Google Sheets対応(未着手。次セッションの最優先事項)

**設計contractが確定済み**: リクエスト形式・chunk仕様・dedupeキー・レスポンス形式・Sheet運用まで、`docs/apps_script_v3_spec.md`に合意事項として書き出してある。実装前に必ずこのファイルを読むこと(要点は以下にも再掲するが、詳細・JSON例はそちらが正)。

**現物確認済みの事実(2026-09-18時点)**:

1. Apps Script(`Code.gs`)は現在**Experiments専用**の`doPost`のみで、ResearchDraws用のルーティングは存在しない。
2. `doPost`はheaderごとに`payload[header]`を読み、`experiment_id`でdedupeして1行書き込む構造。
3. 旧Target列(shape/primary_effect_id等)が空だった原因は**確定した**: 以前のクライアントは`target`がネストしたobjectのままpayloadに含まれており、`payload.shape`等のフラットなキーが存在しなかったため。**現在の`services/submissionDto.ts`は送信前にflatten済み**なので、このDTOをそのままExperiments行の正として送信してよい(Apps Script側のExperiments処理自体は変更不要、または最小限)。
4. `success_cdf_at_roll` / `survival_probability_at_cutoff`(Sheets側の既存の派生列)は現在**R1C1の相対参照**で計算されており、v3で列を追加すると参照がずれて壊れる。**header名ベースの参照に書き換える必要がある**。
5. 既存Sheetsデータは28件前後。**変更・削除・推測backfillは一切しない**(v2以前のレコードにv3の列を後付けで埋めない)。
6. 既存Experimentsの`experiment_id`によるdedupeロジックは**維持する**(壊さない)。
7. Google Sheetsのtimezoneが現在`America/Los_Angeles`になっている。**v3の本収集を始める前に`Asia/Tokyo`へ変更する**(タイムスタンプ列の解釈がずれるため、変更後の既存行への影響有無も確認すること)。
8. Apps Script変更後は**新しいdeploymentが必要**(コード変更だけではWebアプリURLへ反映されない)。

**ResearchDraws受信の設計要件の要点(詳細は`docs/apps_script_v3_spec.md`)**:

- POSTに`request_type`を持たせる(`"experiment"` / `"research_draws_chunk"`。`request_type`が無い旧POSTは`experiment`として後方互換的に扱う)。
- ResearchDrawsは通常250件・上限500件/requestのchunkで送る(`chunk_id`例: `<experiment_id>:1-250`)。dedupeの正本はchunk_idではなく**`experiment_id + draw_index`の複合キー**。
- 受信したchunkは1行ずつ`appendRow`せず、**まとめて`setValues`で書き込む**。
- レスポンスは最低限`{ ok, received, inserted, duplicates }`を返し、クライアントが送信件数と処理件数の不一致を検知できるようにする。
- Experimentsの既存`experiment_id`単体dedupeは維持する(ResearchDrawsの複合キーdedupeとは別ロジック)。
- クライアント側(`app/web`)のResearchDraws送信処理自体もまだ実装していない(IndexedDBへの永続化とcheckpointは完了済みだが、Apps Scriptへ送るコードはまだ無い)。`researchSubmission.ts`と同様のパターン(endpoint未設定ならlocal_onlyのまま、送信失敗してもローカルデータは失われない)を踏襲する想定。
- 新規`ResearchDraws` tabを作成する(既存Experiments tabは変更しない)。
- 将来`research_events_chunk`等を追加できるよう`request_type`方式にしておくが、今回(次セッション)はResearchEventsを実装しない。

**次セッションで最初にやること(この順で設計・実装)**:

1. v3 Experiments schema(既存43列は削除・並べ替えせず、`docs/apps_script_v3_spec.md`記載の新規列候補を右側に追加。現行`Code.gs`のExperiments処理とクライアントの`submissionDto.ts`のフィールド対応を確認し、必要な差分だけ直す)
2. ResearchDraws schema(新規tab。列定義は`docs/apps_script_v3_spec.md`参照)
3. Apps Scriptのrequest routing(`request_type`でdoPost内を振り分け、無指定は`experiment`扱いにする後方互換を維持)
4. chunk化・idempotency(`experiment_id+draw_index`でのdedupe、`setValues`での一括書き込み、レスポンスでの処理件数返却)
5. クライアント側のResearchDraws upload実装(chunk化・送信・再送・失敗時のfail-soft)
6. `success_cdf_at_roll` / `survival_probability_at_cutoff`のR1C1相対参照をheader名ベースの参照へ書き換える(v3列追加で壊れないように)
7. Spreadsheet timezoneを`America/Los_Angeles`→`Asia/Tokyo`へ変更(v3本収集前。過去のISO timestamp自体は書き換えない)

進める前に、現行`Code.gs`本体・`docs/apps_script_v3_spec.md`・本ファイルを読むこと。

### 2. Analysis拡張(未着手)

- `docs/experiment_ui_flow_spec.md`のP節(元の指示)に列挙された比較群(理論期待回数vs実際、客観的不運度vs sensor_score、coin消費vs sensor_score/effort_reward_fit_score等)。
- 分析の方向性を先に固定せず、まずraw dataの収集を優先する方針。

## 触ってはいけないもの

- `app/core`(DrawEngine/ProbabilityEngine)の確率分布・Fidelity Contract。今回追加した`computeGemProbability`/`enumerateGemProbabilities`/`computeDatasetEntropyBits`は既存ロジックの組み合わせに過ぎず、これ自体も変更対象ではない。
- 既存の`v2-*`以前のresearch_protocol_versionレコードへの推測backfill(target_label_snapshotやcoin関連フィールドが無くても補完しない)。
- `motsuyoku-sensor-core`のnpmパッケージ名・localStorageキー(`motsuyoku_sensor_*`)は互換性のため維持中。新規識別子には`butsuyoku`を使う方針(既存資産のrenameはしない)。

## 主要ファイル

- **Apps Script v3送信仕様(次セッションで最初に読む)**: `docs/apps_script_v3_spec.md`
- コイン計算: `app/web/src/lib/coinCost.ts`(`COIN_COST_OPTIONS`/`INITIAL_COIN`を必ずここから参照)
- researchEligible: `app/web/src/lib/researchEligibility.ts`
- 実験フロー全体: `app/web/src/hooks/useResearchSession.ts`
- ResearchDraws永続化: `app/web/src/storage/researchDrawsDb.ts`
- Experiments永続化・CSV: `app/web/src/storage/researchHistory.ts`
- 送信DTO: `app/web/src/services/submissionDto.ts` / `app/web/src/services/researchSubmission.ts`
