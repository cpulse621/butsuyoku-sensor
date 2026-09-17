# Apps Script v3 データ送信仕様

次セッションでApps Script(`Code.gs`)とクライアント側ResearchDraws送信を実装する際の設計contract。
`docs/handoff.md`から参照される詳細仕様。ここに書かれた内容は実装前の合意事項であり、
まだコードには反映していない(次セッションで着手する)。

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
  - `draw_detail_count`
  - `draw_detail_status`
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

## 現物確認済みの前提(2026-09-18時点、`docs/handoff.md`と重複するが再掲)

- 現行`Code.gs`はExperiments専用の`doPost`のみで、`experiment_id`でdedupeして1行書き込む構造。
- 旧Target列が空だった原因は、以前のクライアントが`target`をネストしたobjectのまま送っていたため。現在の`services/submissionDto.ts`はflatten済みで、これがそのままExperiments行の正になる。
- `success_cdf_at_roll` / `survival_probability_at_cutoff`は現在R1C1の相対参照で計算されており、v3で列を追加すると参照がずれる。**header名ベースの参照へ書き換える**。
- Apps Script変更後は新しいdeploymentが必要。
