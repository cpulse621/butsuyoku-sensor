# Apps Script v3 データ送信仕様

Apps Script(`Code.gs`)とクライアント側ResearchDraws送信の設計contract。`docs/handoff.md`から参照される詳細仕様。

## 実装状況(2026-09-18時点)

- **クライアント側(`app/web`)は本仕様に対応済み**: `services/researchSubmission.ts`(Experiments、`request_type: "experiment"`のenvelope)、`services/researchDrawsSubmission.ts`(ResearchDraws、250件/chunkでの`request_type: "research_draws_chunk"`送信)、`services/appsScriptEndpoint.ts`(共通POST処理)。
- **Apps Script側は未デプロイ**: `apps_script/Code.gs`に本仕様のリファレンス実装を書き起こしたが、実際のプロジェクトの現行`Code.gs`を直接見て差分マージしたものではない。デプロイ前に必ず`apps_script/README.md`のレビュー手順に従うこと。
- 実際のGoogle Apps Scriptエンドポイントに対しては本ラウンドでは一切送信していない(未レビューのスクリプトに対して本番の研究データを送るリスクを避けるため)。ブラウザ確認は`VITE_RESEARCH_ENDPOINT`未設定の状態(`local_only`扱い)でのみ行った。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`のR1C1相対参照修正は、実際の数式を見ていないため`apps_script/Code.gs`に含まれていない。

---

## 1. データは2層

### Experiments — 1 experiment = 1 row

研究条件・Target・アンケート・終了結果など、実験全体のsummaryを保存する。

- **既存43列は削除・並べ替えしない**。v3の新規列は原則として右側へ追加する。
- 追加候補列:
  - `active_duration_ms`
  - `resume_count`
  - `termination_reason`
  - `effort_reward_fit_score`
  - `perceived_expected_draws`
  - `initial_coin`
  - `coin_used`
  - `coin_remaining`
  - `coin_cost_model_version`
  - `research_protocol_version`
  - `draw_detail_schema_version`
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
3. **chunk成功条件は `received === inserted + duplicates`。** Apps Scriptはこの等式が成り立つ場合のみそのchunkを成功として扱う。成り立たない場合(=一部rowが検証エラー等でinsertされず、duplicateにもならなかった)はchunk失敗として扱い、4節のvalidation方針に従って書き込みを行わない。
4. **ResearchDraws chunkは書き込み前に全rowをvalidationする。**
   - malformedなrow(必須フィールド欠落・型不一致等)を黙ってskipしてはいけない。
   - validationに1件でも失敗した場合、**原則としてchunk全体を失敗させ、`setValues`を一切実行しない**(部分書き込みをしない)。
   - この全か無かの方針により、クライアントは同じchunkをそのまま安全に再送できる(部分的に書き込まれた行と再送分が重複する、といった状態を防ぐ)。
   - 失敗時のレスポンスにも`ok: false`と、可能であればどのrow(何番目のdraw_index)がvalidationに失敗したかを含め、クライアント側でのデバッグ・修復を助ける。
5. **dedupeは引き続き`experiment_id + draw_index`の複合キーを正本とする。**（3節の内容を再確認。`chunk_id`はログ・トレース用の識別子であり、dedupeの判定には使わない。）

---

## 現物確認済みの前提(2026-09-18時点、`docs/handoff.md`と重複するが再掲)

- 現行`Code.gs`はExperiments専用の`doPost`のみで、`experiment_id`でdedupeして1行書き込む構造。
- 旧Target列が空だった原因は、以前のクライアントが`target`をネストしたobjectのまま送っていたため。現在の`services/submissionDto.ts`はflatten済みで、これがそのままExperiments行の正になる。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`は現在R1C1の相対参照で計算されており、v3で列を追加すると参照がずれる。**header名ベースの参照へ書き換える**。
- Apps Script変更後は新しいdeploymentが必要。
