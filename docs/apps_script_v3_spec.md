# Apps Script v3 データ送信仕様

Apps Script(`Code.gs`)とクライアント側ResearchDraws送信の設計contract。`docs/handoff.md`から参照される詳細仕様。

## 実装状況(2026-09-18時点)

- **クライアント側(`app/web`)は本仕様に対応済み**: `services/researchSubmission.ts`(Experiments、`request_type: "experiment"`のenvelope)、`services/researchDrawsSubmission.ts`(ResearchDraws、250件/chunkでの`request_type: "research_draws_chunk"`送信)、`services/appsScriptEndpoint.ts`(共通POST処理)。
- **クライアント側はchunk成功条件`received === inserted + duplicates`をローカルで検証する**: `services/researchDrawsSubmission.ts`はApps Scriptのレスポンスがこの等式を満たした場合のみそのchunkを成功として扱い、`storage/researchDrawsSyncStatus.ts`(ブラウザのlocalStorageのみ、Experimentsの`submission_status`ともSheets側の`draw_detail_status`とも独立)へ「どのdraw_indexまでack済みか」を永続化する。次回`syncResearchDrawsForExperiment`を呼ぶと、そのexperiment_idについて未ack分のchunkだけを送り直す(タブを閉じてもresume可能)。等式が崩れる・レスポンス形状が壊れている場合はHTTP自体が200でも失敗として扱い、進捗を進めない。
- **Apps Script側は実物のCode.gsをベースにレビュー・統合済み、ただしまだ未デプロイ**: ユーザーから実際に稼働している`Code.gs`全文の提供を受け、それを正本として`apps_script/Code.gs`を書き直した(既存のExperiments処理・重複検知・空き行書き込み・`safeValue_`・`LockService`はすべて実物のロジックをそのまま維持)。デプロイ前に必ず`apps_script/README.md`の確認手順(特にsuccess_cdf_at_roll/survival_probability_at_cutoffの参照列を検証する2つの診断関数)に従うこと。
- 実際のGoogle Apps Scriptエンドポイントに対しては本ラウンドでは一切送信していない(まだユーザーが確認・デプロイしていないスクリプトに対して本番の研究データを送ることになるため)。ブラウザ確認は`VITE_RESEARCH_ENDPOINT`未設定の状態(`local_only`扱い)でのみ行った。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`のR1C1相対参照は、実際の数式テキストをユーザーから提供を受け、header名ベースの絶対参照へ書き換えた(`apps_script/Code.gs`の`setDerivedFormulas_`)。ただし、その相対参照が実際にどの列名を指していたか自体は、数式の構造(2項分布のCDF/生存関数)とクライアント側の型定義から再構成した推測であり、実ヘッダー行との突き合わせはまだ済んでいない。デプロイ前に`apps_script/README.md`記載の診断関数で確認すること。
- 以前この節にあったExperiments v3候補列のうち、`initial_coin`は実際のクライアント側フィールド名`coin_initial`の誤記だったため修正した。また`coin_cost_model_version`・`draw_detail_schema_version`はResearchDraws側の列であり、Experimentsの列ではなかったため候補から削除した(下記2節参照)。

---

## 1. データは2層

### Experiments — 1 experiment = 1 row

研究条件・Target・アンケート・終了結果など、実験全体のsummaryを保存する。

- **既存43列は削除・並べ替えしない**。v3の新規列は原則として右側へ追加する。
- 追加候補列(クライアント側`ResearchExperiment`型の実フィールド名と一致させたもの。`coin_cost_model_version`・`draw_detail_schema_version`はResearchDraws側の列でありExperimentsには含めない):
  - `active_duration_ms`
  - `resume_count`
  - `termination_reason`
  - `effort_reward_fit_score`
  - `perceived_expected_draws`
  - `coin_initial`
  - `coin_used`
  - `coin_remaining`
  - `research_protocol_version`
  - `reveal_mode`
  - `reveal_interval_ms`
  - `draw_detail_count`(意味は8節参照。**ローカルで記録されたvisible ResearchDrawsの期待件数**であり、Apps Scriptへのupload済み件数ではない)
- `draw_detail_status`は永続列として持たない(8節参照)。
- 既存データへの推測backfillは禁止(v2以前の行にこれらの新列を後付けで埋めない)。

### ResearchDraws — 1 visible draw = 1 row

保存項目:

- `experiment_id`
- `draw_index`
- `batch_index`
- `active_elapsed_ms`
- `wall_elapsed_ms`
- `dataset_id`
- `shape_id`
- `primary_effect_id`
- `primary_value_rank`
- `secondary_effect_id`
- `secondary_value_rank`
- `curse_id`
- `target_match`
- `gem_probability_exact`
- `gem_surprisal_bits`
- `coin_cost`
- `coin_remaining_after_draw`
- `coin_cost_model_version`
- `draw_detail_schema_version`

- Near Miss等の解釈値は保存せず、raw drawからAnalysis時に導出する。
- Target・sensor_score・desire_score等のexperiment-level情報はResearchDrawsへ重複保存しない。`experiment_id`でExperimentsとJOINする。

---

## 2. HTTP request routing

今後のPOSTには`request_type`を持たせる。

**Experiment**:

```json
{
  "request_type": "experiment",
  "schema_version": "experiment-v3",
  "payload": { ... }
}
```

**ResearchDraws**:

```json
{
  "request_type": "research_draws_chunk",
  "schema_version": "research-draw-v2",
  "experiment_id": "...",
  "chunk_id": "...",
  "draws": [ ... ]
}
```

- 後方互換性のため、`request_type`が無い旧POSTは`experiment`として扱う。
- Experimentsのレスポンス形状は実物`Code.gs`の既存挙動をそのまま維持する: 成功時`{ok:true, duplicate:false, experiment_id, row}`、既存experiment_idと重複時`{ok:true, duplicate:true, experiment_id}`(上書きはしない)、エラー時`{ok:false, error}`。クライアント側はHTTPレベルの成否のみを見るため、この形状に依存していない。

---

## 3. ResearchDraws chunk

- 通常: **250 draws / request**
- 上限: **500 draws / request**
- 例: `1-250` / `251-500` / `501-750` / `751-842`
- `chunk_id`例: `<experiment_id>:1-250`
- ただし**dedupeの正本はchunk_idではなく、`experiment_id + draw_index`の複合キー**。同じchunkを何度再送してもResearchDrawsに重複行を作らない。

---

## 4. Apps Script response

ResearchDraws受信時は最低限、処理件数を返す:

```json
{
  "ok": true,
  "received": 250,
  "inserted": 247,
  "duplicates": 3
}
```

クライアント側で送信件数と処理件数の不一致を検知できるようにする。

---

## 5. 書き込み

- ResearchDrawsは**1drawごとにappendしない**。chunk内を配列化し、`setValues()`で一括書き込みする。
- 書き込みは全rowのvalidationが通った場合のみ実行する(8節4項)。1件でも不正なrowがあればchunk全体を書き込まず失敗として返す。
- Experimentsの既存`experiment_id`dedupeは維持する(壊さない)。

---

## 6. 将来拡張

`request_type`方式にしておき、将来的に

- `experiment`
- `research_draws_chunk`
- `research_events_chunk`

等を追加できる構造にする。**今回(次セッション)はResearchEventsは実装しない**。

---

## 7. Sheet運用

- 既存Experimentsデータ(28件前後)は変更しない。
- 新規**ResearchDraws tab**を作成する。
- Spreadsheet timezoneは、v3本収集前に`America/Los_Angeles` → `Asia/Tokyo`へ変更する。**過去のISO timestamp自体は書き換えない**(timezone設定の変更のみ。表示上の解釈が変わる点に注意)。

---

## 8. ResearchDrawsの完全性判定(実装前に固定)

1. **`draw_detail_count`はExperiments側に保存する。** これは**ローカルで記録されたvisible ResearchDrawsの期待件数**(そのexperiment_idでIndexedDBに保存されている行数)であり、Apps Scriptへのupload済み件数ではない。クライアントは自分がローカルに何件記録したかを報告するだけで、送信の成否は別途chunkの成否で判断する。
2. **`draw_detail_status`は永続フィールドとして持たない。** complete / incompleteは、Analysis時にResearchDraws側の`experiment_id`別行数と、Experiments側の`draw_detail_count`を突き合わせて導出する（`ResearchDrawsの実際の行数 === Experiments.draw_detail_count` ならcomplete）。これにより、ResearchDraws送信が後から進んだ際にExperiments側の1行を更新しにいくAPI(後更新API)が不要になる。Apps Script側もクライアント側も、この列への書き込み・読み出しロジックを実装しない。
3. **chunk成功条件は `received === inserted + duplicates`。** Apps Scriptはこの等式が成り立つ場合のみそのchunkを成功として扱う。成り立たない場合(=一部rowが検証エラー等でinsertされず、duplicateにもならなかった)はchunk失敗として扱い、4節のvalidation方針に従って書き込みを行わない。**クライアント側(`services/researchDrawsSubmission.ts`)もこの等式を自分で検証しており**、HTTPレベルで200が返っただけでは成功とみなさず、等式が崩れていれば(またはレスポンス形状が読み取れなければ)そのchunkを失敗として扱い、`storage/researchDrawsSyncStatus.ts`上のack済みdraw_indexを前進させない。
4. **ResearchDraws chunkは書き込み前に全rowをvalidationする。**
   - malformedなrow(必須フィールド欠落・型不一致等)を黙ってskipしてはいけない。
   - validationに1件でも失敗した場合、**原則としてchunk全体を失敗させ、`setValues`を一切実行しない**(部分書き込みをしない)。
   - この全か無かの方針により、クライアントは同じchunkをそのまま安全に再送できる(部分的に書き込まれた行と再送分が重複する、といった状態を防ぐ)。
   - 失敗時のレスポンスにも`ok: false`と、可能であればどのrow(何番目のdraw_index)がvalidationに失敗したかを含め、クライアント側でのデバッグ・修復を助ける。
5. **dedupeは引き続き`experiment_id + draw_index`の複合キーを正本とする。**（3節の内容を再確認。`chunk_id`はログ・トレース用の識別子であり、dedupeの判定には使わない。）

---

## 9. Experiment payloadの必須key検証(本収集開始前の完全性修正)

本番Sheetで、`experiment_id`/`submission_status`/`submitted_at`のみが埋まり他のフィールドが空欄という不完全な行が複数発生していたことへの対応。原因は、旧`Code.gs`が`experiment_id`さえあれば他のfieldの欠落を許容し、空欄のままsent扱いで書き込んでいたため。

1. **`request_type: "experiment"`のv3 envelopeのみ、書き込み前に必須keyの存在を厳格に検証する。** 必須key一覧は`apps_script/Code.gs`の`EXPERIMENT_REQUIRED_KEYS`(34key)を正とする。「keyが存在しない」ことと「値がnull」であることを区別し、nullable fieldはnullでよいが、key自体の欠落は許容しない。
2. **1つでも欠落していれば、Sheetへ1セルも書き込まず**、`{ok:false, error:"experiment_validation_failed", missing_fields:[...]}`を返す。
3. **`request_type`が無いlegacy POST(既存pilot dataを送っていた旧クライアント)には、この厳格validationを適用しない。** 後方互換のため、従来どおり`experiment_id`の存在のみを必須とする。
4. **既存Sheetsの行(不完全な空行を含む)は変更・削除・backfillしない。** 今回の修正は新規POSTの受け付け時にのみ適用され、過去に書き込まれた不完全な行はpilot/incompleteなデータとしてそのまま残す(`docs/handoff.md`参照)。
5. **ResearchDraws側にも合わせて以下を追加する**(3・4節の既存方針を補強するもの):
   - chunk sizeが上限(500件)を超えたら`chunk_too_large`として拒否する。
   - `body.experiment_id`と各`draw.experiment_id`が一致しないrowは不正として扱い、chunk全体を失敗させる。
   - `draw_index`は正の整数であることを検証する(単なる数値型チェックだけでは不十分だったため)。

---

## 現物確認済みの前提(2026-09-18時点、`docs/handoff.md`と重複するが再掲)

- 現行`Code.gs`はExperiments専用の`doPost`のみで、`experiment_id`でdedupeして1行書き込む構造。
- 旧Target列が空だった原因は、以前のクライアントが`target`をネストしたobjectのまま送っていたため。現在の`services/submissionDto.ts`はflatten済みで、これがそのままExperiments行の正になる。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`は現在R1C1の相対参照で計算されており、v3で列を追加すると参照がずれる。**header名ベースの参照へ書き換える**。
- Apps Script変更後は新しいdeploymentが必要。
