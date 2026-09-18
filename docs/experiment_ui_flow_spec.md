# 実験UI・フロー仕様書 (Experiment UI / Flow Spec)

- ステータス: **実装済み（研究モード・シミュレーターモードとも稼働中。GitHub Pagesへ継続的にdeployされている）**
- 対象: 物欲センサー検証アプリ / 血晶石マラソン・シミュレーター
- 関連文書: `docs/blood_gem_draw_engine_spec.md`（確率・抽選ロジックはそちらが正。DrawEngine/ProbabilityEngineは今回の変更でも一切変更していない）。本書は画面フロー・体験・実験運用・研究プロトコルのバージョン管理を扱う。

## 更新履歴

- v0.1: 初版。これまでの会話で決定済みだったモード構成・画面フロー・10連バッチ表示ロジックを整理して文書化（設計段階、UI実装なし）。
- v0.2: 実装完了に伴う全面更新。研究プロトコルv2（`research_protocol_version = "v2-researchdraws-resume-survey5"`）の内容を反映。
  - Target Match/途中終了時の事後アンケートをQ1〜Q3からQ1〜Q5へ拡張（Q4 effort/reward fit、Q5 perceived rarity）。
  - Target Matchの明確な状態通知（TargetMatchNotice）を追加。
  - resume（reload復旧）を、roll_count/batch_count/一時停止回数が0に戻らない方式（案A: Web側で絶対オフセットを管理し、ResearchDraws側を正本として復元）へ刷新。
  - ResearchDraws（1 visible draw = 1 record、IndexedDB）を新設。
  - termination_reason（target_match / participant_giveup / coin_exhausted）をexit_reasonとは別軸で追加。
  - コインシステム・体感希少性(Q5)スライダーの最終仕様は未確定（下記参照）。DrawEngine/ProbabilityEngineの確率分布自体はこの変更で一切変更していない。
- v0.3: Q5の刻みを1-2-5系列16段階＋「わからない」(null)に確定(3.5節)。Target表示情報(label/allowed_values)を送信時点の現在datasetからではなく、実験確定時点(finalize)のsnapshotとして`ResearchExperiment.target_label_snapshot`に保存する方式へ変更(3.7節)。ResearchDrawsへ確率監査用の`gem_probability_exact`/`gem_surprisal_bits`/`coin_cost_model_version`を追加(schema v2、6.2節)。コインコスト式はdataset-normalized surprisal(D方式)を第一候補として確定したが、base/rounding/最低cost/初期coinはまだ未確定(3.8節)。coinの研究上の位置づけを明文化(3.8.1節)。
- v0.4: coin配線前の最終調整。(1) `target_label_snapshot`の生成時点を、finalize（実験終了時）からTargetがLOCKされる実験開始時点（`beginSession`）へ変更。`ActiveExperimentSnapshot`にも保存し、reload/resume後も再計算せず同じ値を引き継ぐ（3.7.1節）。(2) `research_protocol_version`を`"v2-researchdraws-resume-survey5"`へ改名（coinがまだ配線されていない段階でversion名に`coin`を含めるのは誤解を招くため。既存データへは推測backfillしない）。(3) コインコスト式のrounding=`round`・最低cost=`1`・base=`100`を候補として確定（round/floor/ceilの中で系統的な乖離が最小、base=100ならminCostが実質発動しないため）。`app/web/src/lib/coinCost.ts`に`CANDIDATE_COIN_COST_OPTIONS`/`CANDIDATE_INITIAL_COIN`として一元管理する定数を追加。(4) 初期coinの第一候補を`100,000`(=budget horizon ≈ 1,000 draw相当)に設定。500,000〜1,000,000は現行のsequential reveal(400ms/件)・auto間隔(3〜5秒/10連)では実験時間が長くなりすぎるため不採用。(5) researchEligibleの第一候補を`expected_draws ≦ 約1,000`とし、高精度シミュレーション(N=6,000/セル)で確認した(3.8.2節)。コインはまだproductionへ配線していない(base/helper/UI部品/schemaのみ用意)。
- v0.5: **coin/researchEligibleをproductionへ本配線。研究プロトコルv3(`research_protocol_version = "v3-coin"`)。**
  - coinコスト式・パラメータを最終確定: `app/web/src/lib/coinCost.ts`の`COIN_COST_OPTIONS = { base: 100, rounding: "round", minCost: 1 }`・`INITIAL_COIN = 100000`(旧`CANDIDATE_*`から確定値へ改名)。
  - `researchEligible`を`expected_draws <= 1,000`で確定し、`app/web/src/lib/researchEligibility.ts`の`isTargetResearchEligible()`として研究モードのTarget設定画面に実装(3.8.3節)。Simulator modeには適用せず、DrawEngineの分布にも一切影響しない。
  - visible drawごとにcoinを実際に消費し、ResearchDraws(`gem_probability_exact`/`gem_surprisal_bits`/`coin_cost`/`coin_remaining_after_draw`/`coin_cost_model_version`。schemaは既にv2で追加済みのため変更なし)へ実値を記録するようになった(以前はcoin関連が常に`null`だった)。
  - coin<=0かつTarget未達の場合、`termination_reason = "coin_exhausted"`として事後アンケート(Q1〜Q5)後に直接finalizeする(退出理由は挟まない。participant_giveupとは明確に区別する)。同一drawでTarget Matchとcoin exhaustionが同時発生した場合はTarget Matchを優先する(3.6/3.8節)。
  - `ResearchExperiment`に`coin_initial`/`coin_remaining`/`coin_used`を追加し、試行回数・残りコイン・使用コインを研究中常時表示するようにした(6.1節)。
  - Apps Script/Google Sheets ResearchDraws送信、Analysisクエリの拡張は次セッションへ持ち越し(未着手)。
- v0.6(2026-09-19): **researchEligibleの確率による足切りを撤廃。** 学内での検討により「低確率であること自体を理由にTargetを選択不可にしない」という方針が確定した。`isTargetResearchEligible()`の判定基準を`expected_draws <= 1,000`から`p > 0`(ProbabilityEngine上で理論確率を正しく計算できるかどうか)へ変更した(3.8.3節参照。3.8.2節のシミュレーション自体は、この方針変更前に`expected_draws <= 1,000`という具体的なしきい値をどう決めたかの記録として残す)。`RESEARCH_ELIGIBLE_MAX_EXPECTED_DRAWS`定数は削除した。coinのbudget horizon(`INITIAL_COIN`/`COIN_COST_OPTIONS`)自体は変更していない: 低確率なTargetを選んだ場合、Target Match前にcoinが尽きる(`coin_exhausted`)という形で実験が自然に終了する、という既存の独立した仕組みがそのまま働く。DrawEngine/ProbabilityEngineの確率分布・排他ロジックは一切変更していない。EffectPool/排他条件上そもそも成立しない(p=0の)組み合わせは、従来どおり選択不可のまま。

---

## 1. 全体アーキテクチャ：DrawEngineとExperiment Flowの分離

- **DrawEngine**（`blood_gem_draw_engine_spec.md`）: ステートレス。`draw(dataset, count=10)`で指定個数をまとめて生成し、`computeProbability`で確率を計算するだけ。UI・モード・実験の進行状況を一切知らない。バッチ内の各血晶にはローカル連番（1〜count）しか持たない。
- **Experiment Flow**（本書）: ステートフル。実験全体の進行を管理する。実装は2層に分かれている。
  - **Core**（`app/core/src/state/researchModeState.js`）: `setup → running → awaiting_survey → revealed`のphase遷移、Target Match検出、Core内部での相対roll_countの積算。UI・ブラウザAPIから独立。
  - **Web**（`app/web/src/hooks/useResearchSession.ts`）: Coreのラッパー。1件ずつの順次表示、manual/auto進行、事後アンケート・退出理由のオーケストレーション、ResearchDraws/researchHistoryへの永続化、reload復旧（resume）、active/wall時間の計測を担当する。CoreとWebの分担については3.7節を参照。

DrawEngineは「何連目の何個目か」を知らない。実験全体を通した絶対通し番号（`draw_index`/`roll_count`）はWeb側が管理する。

---

## 2. モード共通の方針

- 研究モードとシミュレーターモードは同じ`TargetBloodGem`型・同じDrawEngineを使う。違いは確率の開示タイミングと、10連バッチ結果の見せ方（3章）だけ。
- 血晶設定画面は敵ごとに存在しないスロットを表示しない。
  - 3デブ: secondary（2op）欄なし
  - 貞子: primary・secondaryとも選択可
  - 女幽霊: secondaryは選択欄ではなく固定項目として表示
- 「そもそも不可能な組み合わせを選ばせない」を徹底する（例: primaryに`nourishing`を選んだ場合、許容デメリットの候補から「全攻撃力DOWN」を除外／disabled）。
- `TargetBloodGem`は一度確定したら実験開始後は変更不可（基準の後付け変更を防ぐため）。
- `verificationStatus`に基づく選択可否（DrawEngine仕様書7.1節）:
  - 研究モード: `confirmed`な数値のみTargetの選択候補にする
  - シミュレーターモード: `provisional` / `unknown`も選択可能とし、「未検証」等の表示を添える
- `researchEligible`: 極端に低確率なターゲットは研究モードでは選択不可にする（しきい値はTBD）。これはTarget選択UIのフィルタであり、DrawEngineの抽選プールには一切影響しない。

---

## 3. 研究モード

### 3.1 画面フロー

```
ホーム → 敵選択 → 血晶設定（+ 今回狙う血晶カード） → 欲しさ1〜5評価
  → 10連マラソン（1件ずつ順次表示、manual/auto）
  → [Target Match] → Target Match通知 → 事後アンケートQ1〜Q5 → 結果画面（確率開示）
  → [途中終了] → 事後アンケートQ1〜Q5 → 退出理由 → 結果画面（確率開示）
```

- 血晶設定画面下部の「今回狙う血晶」カードには、敵 / 形状 / 1op / 1op数値 / 2op / 2op数値 / 許容デメリットをまとめて表示する。
- 確率部分は実験終了まで「出現確率は実験終了後に表示されます」のようなロック表示にする。10連マラソン中・事後アンケート回答中も確率は非表示のまま（3.5節）。
- 実験開始時、manual/auto（3.3節）を参加者にはランダムに割り当てる（選択させない）。

### 3.2 バッチの生成と表示（1件ずつ順次表示）

- DrawEngineの`draw(dataset, count=10)`相当で内部的には10個をまとめて生成できるが、参加者への提示は**1個ずつ**、一定間隔（`REVEAL_ITEM_DELAY_MS = 400ms`）を空けて行う。
- 目的はスマホゲーム的な「10連ガチャ演出」ではなく、「また外れた」という個々の結果（特にハズレ）を参加者が1件ずつ認識できるようにすること。派手な演出は行わない（5節参照）。
- 各血晶にはWeb側が付与する**実験全体を通した絶対通し番号**（`draw_index`）を持たせる。「17回目の10連の4個目」のような相対表記ではなく、`#161`, `#162`, `#163`, `#164`... のような通し番号にする。reloadを跨いでもこの番号は連続する（3.7節）。

### 3.3 manual / auto条件

- 実験開始時にランダムへ割り当てる（比較したい要因: 次の10連を自分でクリックするかどうか）。参加者は選択できない。
- **manual**: 「次の10連」ボタンを押した時だけ次のバッチが始まる。
- **auto**: 1バッチの全件表示が完了してから、`auto_interval_ms`（実験開始時に3000〜5000msの範囲で1回だけ決定し、以後その実験中は不変）経過後に自動的に次のバッチが始まる。一時停止・再開が可能で、`pause_count`/`paused_duration_ms`として記録する。

### 3.4 研究モードでの停止ルール（Target Match）

- 10個をまとめて生成すること自体は構わないが、**表示は1個ずつ**進める。
- 最初にTarget Matchが画面に表示された時点で、演出を停止する。
  ```
  #161 → #162 → #163 → #164 TARGET MATCH → （停止）
  ```
- `roll_count`はこのTarget Matchの絶対通し番号までとする（バッチの残り、例えば#165〜#170は`roll_count`に含めない）。
- Target Matchより後ろに生成されていたバッチ内の残りの結果は、**参加者には見せない**し、ResearchDraws（6.2節）にも保存しない（1 visible draw = 1 record: 参加者の画面へ実際に提示されたdrawだけが記録対象）。
- 理由: Target達成後に続けて他の（それ自体は無関係な）結果を見せてしまうと、それが事後の物欲センサー主観評価に影響を与える可能性があるため。実験の内的妥当性を守るための措置であり、DrawEngine側の確率計算には一切影響しない。
- Target Matchの瞬間、「目的の血晶を獲得しました」という明確な状態通知（TargetMatchNotice）を、事後アンケートより前に表示する。理論確率・期待試行回数・不運度はこの時点でもまだ表示しない。派手なガチャ演出ではなく、成功した事実と実際の試行回数(`#N（N回目）`)だけを示す明確な状態通知として実装している。コイン（使用量・残高）はコインシステム実装後にこの通知へ追加する（3.8節）。

### 3.5 事後アンケート（Q1〜Q5、順序固定）

Target Match直後、または途中終了時（3.6節）に、以下の5問へ回答するまで理論確率は一切開示しない。順序は固定で、後の質問が前の質問の回答を誘導しないようにしている。

| # | 質問 | 保存フィールド |
|---|---|---|
| Q1 | 今回の抽選を面倒・長いと感じましたか？ | `tedious_score` (1〜5) |
| Q2 | 実際のゲームで同じ回数だけ周回するとしたら、どの程度苦痛だと思いますか？ | `real_game_burden_score` (1〜5) |
| Q3 | 今回、物欲センサーをどの程度感じましたか？ | `sensor_score` (1〜5) |
| Q4 | 今回の結果は、かけた時間や手間にどの程度見合っていたと感じましたか？ | `effort_reward_fit_score` (1〜5、1=まったく見合っていなかった〜5=とても見合っていた) |
| Q5 | 今回のTargetは、平均すると何回に1回くらい出ると思いましたか？ | `perceived_expected_draws`（対数スケールのスライダーで回答した数値そのもの） |

- Q4は「努力に見合っていない」という仮説をQ3より前に提示してsensor_scoreの回答を誘導しないよう、必ずQ3より後に置く。
- Q5は理論値`expected_draws`と同じ単位（「何回に1回」）で直接比較したいという分析上の目的から、1〜5の主観評価ではなく数値そのものを尋ねる。自由記入の数値入力は桁の見積もりが極端に歪みやすいため、対数的に桁を選べる離散スライダー（`PerceivedRarityInput`）にしている。**刻みは1-2-5系列16段階で確定**（`[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]`）。全tickのラベルを常時並べる必要はなく、現在選択値だけが明確に読めればよい設計とした。「わからない」ボタンを必ず用意し、選択すると`perceived_expected_draws = null`として保存する（無理に推測値を選ばせない。「まだ回答していない」状態とは別管理し、「わからない」も正式な回答として送信を許可する）。
- `effort_reward_mismatch_score`（= 6 − `effort_reward_fit_score`）は保存時に二重持ちせず、Analysis側で都度算出する。
- 分析で使う`actual_to_expected_ratio`（成功時 = `roll_count / expected_draws`）・`cutoff_to_expected_ratio`（censored時 = `cutoff_draws / expected_draws`、あくまで「期待試行回数に対してどこまで試したか」であり「実際に当たるまでの倍率」ではない）も同様にAnalysis側で算出する派生値であり、Experimentsへの重複保存はしない。

### 3.6 途中終了（censored）・退出理由・termination_reason

- 参加者が疲れる等の理由で、Target達成前に実験を中断することを許可する（「実験を終了する」ボタン）。
- 途中終了時も、Target Match時と同じQ1〜Q5の事後アンケートを必ず経由し、その直後にのみ退出理由（`exit_reason`: `no_target` / `tedious` / `time_limit` / `lost_motivation` / `other`）を尋ねる。sensor_score等の回答を退出理由が誘導しないよう、必ずアンケートの後に尋ねる。
- 記録は`success = false`, `censored = true`, `cutoff_draws = 打ち切りまでの絶対通し番号`となる（DrawEngine仕様書10章）。
- `termination_reason`（`target_match` / `participant_giveup` / `coin_exhausted`）は、実験がどう終わったかの客観的・構造的な理由を表す。`exit_reason`（参加者本人の主観的な理由、途中終了時のみ）とは別軸であり、`coin_exhausted`を`exit_reason`へ混ぜることはしない。同一drawでTarget Matchとコイン枯渇が同時に起きる場合はTarget Match成功を優先する（そのdraw自体は正式なvisible drawとして記録する）。
- **`coin_exhausted`のフロー(v0.5で実装)**: coin残高が0以下になり、かつそのdrawがTarget Matchでもなかった場合、`giveUp()`と同じくCore内部の状態確定（`censored=true`・`RUNNING→REVEALED`）は`session.giveUp()`をそのまま再利用するが、参加者の任意終了(`giveUp`ボタン)とは別経路として扱う: `isRetiring`はtrueにならず、Q1〜Q5の事後アンケートには進むが、退出理由(`ExitReasonForm`)は経由せず`exit_reason=null`のまま直接finalizeする。`participant_giveup`（`isRetiring=true`・退出理由あり）とは明確に区別される。

### 3.7 resume（reload復旧）

Coreの`createResearchModeSession()`はクロージャ内部にRNGの消費位置・pendingBatch等のランタイム状態を持ち、シリアライズできない。そのため、画面reload・タブの再読み込み・アプリへの復帰時は、Core自体は新しいセッションとして作り直す（Core内部の未提示pending batch、すなわち参加者へまだ見せていないdrawは研究データではないため破棄してよい）。

一方で、**roll_count・batch_count・一時停止回数・経過時間は0に戻さない**（採用: 案A = Web側でオフセットを管理する方式）。

- 各visible drawが画面へ提示された時点で、即座にResearchDraws（IndexedDB。6.2節）へcheckpointする。バッチ（10連）の完了を待たない。これにより、reload直前まで提示済みだったdrawが失われることはない。
- reload後の再開時、ResearchDraws側に保存済みの「そのexperiment_idの最後の行」を正本として、
  - `roll_offset` = 保存済みのdraw数（次の絶対通し番号のベース）
  - `batch_offset` = 最後の行の`batch_index`
  - `active_elapsed_ms`の基準値 = 最後の行の`active_elapsed_ms`
  を復元し、新しいCoreセッションが返す相対roll_countにこのoffsetを足すことで絶対値を継続する。
- `pause_count`/`paused_duration_ms`/`resume_count`はResearchDrawsには無いため、`localStorage`の`ActiveExperimentSnapshot`（識別情報＋これらの補助情報のみを持つ）から復元する。
- `draw_advance_mode`/`auto_interval_ms`は元の割り当てをそのまま引き継ぐ（reload後に再抽選しない）。
- 新しいCoreセッションのRNGは新規に生成されるが、各drawの抽選は独立試行のままであるため、resumeを挟んでも確率分布上の問題はない（DrawEngine自体は毎回独立に`drawOne`を呼ぶだけであり、セッションを跨いだ相関を仮定していないため）。
- raw draw詳細（ResearchDraws）はlocalStorageではなくIndexedDB（`app/web/src/storage/researchDrawsDb.ts`）に保存する。

**「画面を離れていた時間」と「活動していた時間」の区別**: `duration_ms`（既存・後方互換。壁時計、`finished_at - started_at`）とは別に、`active_duration_ms`（新規）を追加した。running中・タブが可視（Page Visibility APIで判定）・auto一時停止中でない、の3条件がすべて揃っている間だけ加算する。ブラウザを閉じていた時間・タブを裏に回していた時間・auto一時停止中の時間は`active_duration_ms`に含まれない。ResearchDrawsの各行にも同じ考え方で`active_elapsed_ms`（その時点までの累積値）と`wall_elapsed_ms`（`started_at`からの単純な経過時間）を両方保持し、「30分間画面を離れていた」を「30分間抽選作業をしていた」と誤解するデータ構造にはしていない。`resume_count`（reload後に再開した回数）も新規に追加した。

### 3.7.1 Target表示情報のsnapshot（label/allowed_values）

`primary_label`/`primary_allowed_values`/`secondary_label`/`secondary_allowed_values`/`accepted_curse_labels`（6.1節でSheetsへ送るTarget表示情報）は、**TargetがLOCKされる実験開始時点（`useResearchSession.ts`の`beginSession`）で1回だけ計算し、`ResearchExperiment.target_label_snapshot`としてそのまま保存する**（`lib/targetSummary.ts`の`buildTargetLabelSnapshot`）。finalize（実験終了）時点では再計算せず、実験開始時にmetaへ保持しておいた値をそのままコピーするだけにしている。

- 理由: 「実験開始時点の表示内容」という目的を満たすには、実験の途中でdeployが挟まる可能性がある以上、実験終了時点ではなく開始時点で固定する必要があるため（1実験の所要時間中にdataset側のValueSeriesやi18nラベル辞書が更新されても、その実験の表示内容は変化しない）。
- reload/resumeでもこのsnapshotを再計算しない: `ActiveExperimentSnapshot`（3.7節）にも実験開始時点の`target_label_snapshot`をそのまま保存し、resume後のCoreセッション再作成時もこの値をそのまま引き継ぐ。
- canonicalな正本は引き続きID/rank（`target.*`、`data_version`）であり、このsnapshotはあくまで表示用の派生値。
- `services/submissionDto.ts`は送信時にdatasetを参照せず、`target_label_snapshot`をそのままフラット化して使うだけになった（送信時点の再導出をやめたことで、`GemDatasets`registryへの依存自体が無くなった）。
- このsnapshot導入より前に保存された既存recordには`target_label_snapshot`が存在しないが、現在のdatasetから推測してbackfillすることはしない（該当欄は空文字のまま送信される）。

### 3.8 コインシステム（v0.5でproductionへ本配線済み）

試行回数に加えてコイン残高を研究モード実験中は常時表示し（3.8.4節）、コインが0以下になった時点でその実験を終了させる（`termination_reason = "coin_exhausted"`、3.6節）。draw数そのものの固定上限にはしていない。

- 「その1個の血晶そのものが出る確率」は、`computeGemProbability(dataset, gem)`（`app/core/src/engine/probabilityEngine.js`）で正確に計算する。dataset全体の全組み合わせと確率の列挙（`enumerateGemProbabilities`）・Shannon entropy（`computeDatasetEntropyBits`）も同モジュールに実装済み。いずれも既存`computeProbability`の組み合わせ・集計であり、新しい確率モデルの追加ではない。
- **確定したコスト式(dataset-normalized surprisal)**: `coin_cost = max(1, round(100 × I(g) / H(dataset)))`（`I(g) = -log2(P(g))`）。この式は設計上`E[I(g)] = H(dataset)`のため、**平均costが常にbaseちょうどになり、datasetが変わっても平均消費ペースが自動的に揃う**という実用上の利点がある（tier方式・raw surprisal方式はdatasetごとに平均costが2〜3倍ばらつくため、この利点がない）。round/floor/ceilを比較し、roundが最も系統的な偏りが小さかった（3データセットいずれもbaseからの乖離1%未満）ため採用した。`minCost=1`はbase=100であれば3データセットとも実質発動しないことを確認済み。
- 確定した設定は`app/web/src/lib/coinCost.ts`の`COIN_COST_OPTIONS = { base: 100, rounding: "round", minCost: 1 }`・`INITIAL_COIN = 100000`として一元管理し（各所にハードコードしない）、`useResearchSession.ts`の`revealBatch()`が各visible drawごとにこれを使って実際にcoinを消費する。単純な`1/p`は超低確率時に値が爆発するため採用しない。
- **baseとinitial coinは独立した研究条件ではなく、両者の比 `initial_coin / base` が「平均的にどれだけのdrawに相当するcoin予算を用意するか（budget horizon）」を実質的に決める1つのパラメータである**（`E[cost] = base`なので、期待値上は`initial_coin / base`回のdrawでbudgetを使い切る計算になる）。`initial_coin = 100,000` / `base = 100` は、budget horizon ≈ 1,000 draw相当を意味する。500,000〜1,000,000は、現行のsequential reveal（400ms/件）・auto間隔（3〜5秒/10連）を踏まえると1実験が長くなりすぎる可能性が高いため不採用とした。
- ResearchDraws（6.2節）の`coin_cost`/`coin_remaining_after_draw`/`coin_cost_model_version`列は、v0.5以降すべてのdrawで実値が記録される（v0.5より前のレコードでは`null`のまま。既存データへ推測backfillはしない）。`coin_remaining_after_draw`は符号付き(オーバーシュートで負になりうる)の値を監査用にそのまま保存し、参加者向けの表示・`ResearchExperiment.coin_remaining`は下限0でclampする。
- `ResearchExperiment`の`coin_used = coin_initial - (符号付きの)coin_remaining`。coin_exhausted時は最後のdrawのオーバーシュート分だけ`coin_initial`を超えることがある（実消費量として正確な値）。

### 3.8.1 コインの研究上の位置づけ（重要）

コインは「客観的な努力量そのもの」の指標ではない。低確率な結果ほど高costにする設計は、参加者に対して「珍しいTarget外の結果」に**追加の意味**（欲しいものではない、さらにresourceを失う）を与えるための、**research protocol上の有限resource / cost体験**として導入するものであり、単なる試行回数の言い換えではない。

分析時の注意: `spent_coin`と`sensor_score`の相関を、そのまま「客観的努力量→物欲センサー」と解釈してはならない。coinの消費量には、通常の試行回数が持つ情報に加えて「その体験がどれだけ意味的に軽い（よくある）結果／重い（珍しい）結果で構成されていたか」という別の次元が混ざっているため、`roll_count`/`active_duration_ms`（客観的な試行回数・活動時間）と`spent_coin`（cost体験）は別々の指標として扱い、必要に応じて両方を独立変数として分析する。

### 3.8.2 researchEligible確定に向けた追加シミュレーション

`initial_coin = 100,000` / `base = 100` / `round` / `minCost = 1`（3.8節の候補）を固定し、3データセットそれぞれで実際に作成可能なTarget（shape全選択・呪いはeligible全選択とした上で、primary/secondary effectとrank部分集合を検索して`expected_draws`が各帯に最も近いものを採用）について、N=6,000試行/セルでシミュレーションした。

| expected_draws帯 | target_match成功率(N=6,000) | coin_exhausted率 |
|---|---|---|
| ≈100 | 6000/6000 (100%) | 0/6000 (0%) |
| ≈250 | 約5,870〜5,900/6,000 (約98%) | 約2% |
| ≈500 | 約5,130〜5,190/6,000 (約86%) | 約14% |
| ≈750 | 約4,400〜4,500/6,000 (約74%) | 約26% |
| ≈1,000 | 約3,780〜3,840/6,000 (約63〜64%) | 約36〜37% |
| ≈1,250 | 約3,020〜3,420/6,000 (約50〜57%、データセットにより差あり) | 約43〜50% |
| ≈1,500 | 約2,900〜3,000/6,000 (約49%) | 約51% |
| ≈2,000 | 約2,300〜2,440/6,000 (約39〜41%) | 約59〜61% |

3データセットの結果はいずれも同じ帯でほぼ一致した（D方式のdataset間正規化が効いている）。成功時のdraws平均はexpected_draws帯によらず400〜460回程度に収束する一方（budgetが先に尽きるケースが増えるため）、exhausted時のdraws平均はほぼ全帯で1,000回前後（=budget/base）で一定だった。成功時の残高平均はexpected_draws帯が上がるほど減少し（＝ぎりぎりで成功する体験が増える）、exhausted時は定義上残高0・消費100,000固定。

この結果から、**researchEligibleを`expected_draws ≦ 1,000`に確定した**: この帯までは過半数(約63%以上)が成功し、かつ約4割弱が`coin_exhausted`を経験するため、「全員がほぼ確実に成功する」設計を避けつつ、「投入したresourceに結果が見合わなかった感覚」を一定割合の参加者に生じさせられる。`expected_draws`が1,250を超えると成功率が5割を切り、2,000では約4割まで下がるため、研究目的（不運の程度と主観評価の関係を見る）に対して厳しすぎると判断した。

### 3.8.3 researchEligibleのUI実装(v0.6で確率による足切りを撤廃)

**v0.6時点の仕様**: `app/web/src/lib/researchEligibility.ts`の`isTargetResearchEligible(dataset, target)`が、`computeProbability(dataset, target).p > 0`かどうかだけを判定する。低確率であること自体を理由にTargetを選択不可にはしない(方針確定。撤廃前の`expected_draws <= 1,000`というしきい値と、それをどう決めたかの記録は3.8.2節・v0.5changelog参照)。`ResearchView.tsx`のTarget設定画面がこれを使い、Targetが完成した時点で判定し、

- p>0(eligible)なら通常どおり「次へ（欲しさ評価）」→「実験を開始」ボタンを表示する。極端に低確率なTargetであっても、この判定だけでは弾かない。
- p=0(EffectPool/排他条件上そもそも成立しない組み合わせ。例: primary/secondaryが同一effectIdでallowDuplicateSecondary=falseの場合、存在しない効果IDを指定した場合)の場合のみ、両ボタンとも表示せず「この組み合わせは実際には出現しえないため、研究モードでは選択できません。1op・2opの組み合わせなど、条件を変更してください。」という案内だけを表示する。**実際のp/expected_draws自体は開示しない**（理論確率は実験終了後まで非公開、という既存方針を維持する）。

この判定はTarget選択UI(研究モードのみ)だけに適用され、DrawEngineの抽選プール・ProbabilityEngineの確率計算・Simulator modeには一切影響しない。coinのbudget horizon(3.8節)は本判定とは独立した仕組みとして維持されており、極端に低確率なTargetを選んだ場合は「Target Match前にcoinが尽きる(`coin_exhausted`)」という形で実験が自然に終了する。

### 3.8.4 コインの常時表示

研究モードの実験中(`ResearchRunningLayout`)は、既存の試行回数・経過時間に加えて「残りコイン」「使用コイン」を常時表示する。値は`useResearchSession`が返す`coinRemaining`/`coinUsed`（いずれも下限0でclamp済み）をそのまま使う。

### 3.9 Target Match通知

3.4節参照。理論確率等の開示前に「目的の血晶を獲得しました」を明確に表示する。強調表示のスタイル自体は`docs`のUIトーン方針（5節）に従い、過度な演出にはしない。

---

## 4. シミュレーターモード

### 4.1 画面

- 研究モードと同じ血晶設定UIを使うが、条件を変更するたびに画面下部へリアルタイムで出現確率と内訳（形状／1op／ランク／呪いごとの確率）を展開表示する。
- 許容デメリットを複数選択した場合も、その場で再計算して表示する。

### 4.2 10連バッチの表示

- 通常のガチャ演出として、**10個すべてを表示する**。研究モードのような途中停止は行わない。
- Target Matchの概念自体は使わない（シミュレーターモードには「狙って終了する」という実験上の制約がないため）。ただし同じ`TargetBloodGem`を設定して「狙った血晶が出たかどうか」を目視で確認する使い方は可能。

---

## 5. UIのトーン

- Bloodborneそのものを模倣しすぎず、Material 3 Expressiveをベースにした現代的なAndroid UIとする。
- 血晶マラソンらしさが伝わる程度の演出（例: 10連の一個ずつのテンポ）に留め、過度な再現は狙わない。
- Target Match通知（3.4/3.9節）は、派手なガチャ演出ではなく明確な状態通知として実装する。過度な演出で主観評価（sensor_score等）を変えないことを優先する。

---

## 6. 実験ログとの対応

ログ項目自体の定義は`blood_gem_draw_engine_spec.md`10章を正とする。本書からの補足:

- `roll_count`は3.4節の通り、研究モードではTarget Matchの絶対通し番号まで（バッチ内の残りは含まない）。resumeを跨いでも0に戻らない（3.7節）。
- `batch_count`は「10連を押した回数」であり、研究モードで最後のバッチが途中停止した場合もそのバッチは1回とカウントする。resumeを跨いでも継続する。
- Target Matchより後ろの「見せない結果」は、ログ（ResearchDraws含む）にも一切保存しない（1 visible draw = 1 record の原則を徹底するため）。

### 6.1 バージョン管理

以下を各Experimentsレコードへ保存する。

| フィールド | 値 |
|---|---|
| `app_version` | `app/web/package.json`のversion |
| `research_protocol_version` | `"v2-researchdraws-resume-survey5"`（本書v0.2時点。コイン・ResearchDraws・新survey項目・完全resumeを導入したバッチ以降の実験を区別するため。既存レコードへは推測で書き込まない） |
| `draw_detail_schema_version` | ResearchDrawsのraw schemaバージョン（現在`1`） |
| `reveal_mode` | `"sequential"`固定 |
| `reveal_interval_ms` | `400`固定（`REVEAL_ITEM_DELAY_MS`） |

`auto_interval_ms`は実験開始時に3000〜5000msの範囲で1回だけ決定し、バッチごとに再抽選しない（3.3節）。

### 6.2 ResearchDraws schema

`app/web/src/storage/researchDrawsDb.ts`（IndexedDB、object store名`draws`、`experiment_id`にindex）に、以下のフィールドを1 visible draw = 1 recordで保存する。

| フィールド | 内容 |
|---|---|
| `experiment_id` / `draw_index` | 複合一意キー（`${experiment_id}::${draw_index}`をIndexedDBの`id`とし、再書き込みはidempotentに上書きする） |
| `batch_index` | どの「次の10連」操作で生成されたか（resumeを跨ぐ場合はベストエフォート） |
| `active_elapsed_ms` / `wall_elapsed_ms` | 3.7節参照。このdraw提示時点での累積値 |
| `dataset_id` / `shape_id` / `primary_effect_id` / `primary_value_rank` / `secondary_effect_id` / `secondary_value_rank` / `curse_id` | BloodGemのcanonical raw field。near miss等の解釈は行わず、後から自由に再計算できるようraw値のまま保持する |
| `target_match` | このdrawがTarget Matchだったか |
| `gem_probability_exact` | このgem自身（の組み合わせぴったり）が出る正確な確率（`computeGemProbability`由来）。coin_costがdrawの確率に依存する式になるため、監査・再計算用に常時記録する（コイン未実装の現在も記録している） |
| `gem_surprisal_bits` | `-log2(gem_probability_exact)`。surprisal系のcoin_cost式が直接使う量そのもの |
| `coin_cost` / `coin_remaining_after_draw` | コインシステム未実装のため現状は常に`null`（3.8節） |
| `coin_cost_model_version` | そのdrawのcoin_costがどのモデル/バージョンで計算されたか。coin_costが`null`の間は同様に`null` |
| `draw_detail_schema_version` | このrowのschemaバージョン（現在`2`。v1からv2で確率監査用スナップショットを追加） |

Experiments側の`draw_detail_count`は、`experiment_id`でResearchDrawsを検索した実際の行数を、実験finalize後に非同期で反映したもの（Experiments上の想定draw数とResearchDrawsの実データが一致しているかを確認できるようにするため）。

Apps ScriptへのResearchDraws送信（chunk化・`experiment_id + draw_index`によるidempotentな一括送信）は、クライアント側の永続化・schema設計までが完了しており、Apps Script側の受け口は現物確認後に対応する（未実装）。

---

## 現時点でのTBD一覧

- Apps Script側: Experiments列のflatten対応・ResearchDraws受信endpointの実装（現物確認後に対応。**次セッションの作業**）
- Analysisクエリの拡張（P節で挙げた比較群: 理論期待回数vs実際、客観的不運度vssensor_score、coin消費vssensor_score/effort_reward_fit_score等）。まずAnalysis用のraw data収集を優先し、分析方向は先に決めない方針を維持する。**次セッションの作業**
- `researchEligible`は確率による足切りを撤廃し`p > 0`のみで判定する方式に確定（v0.6、3.8.3節）。コインコスト式（base=100/round/minCost=1）・初期coin（100,000）も確定済み（以前のTBDを解消）
- コインのproduction配線・Q5スライダーの刻み・Target表示情報のsnapshot生成時点・`research_protocol_version`の命名は確定済み（以前のTBDを解消）

---

## 次のステップ

1. **Apps Script側の対応**（Experiments列flatten・ResearchDraws受信・chunk送信・idempotent処理）。クライアント側のDTO設計・ResearchDrawsのローカル永続化は完了しているため、Apps Scriptの現物を確認しながら受け口を実装する。
2. **Analysisクエリの拡張**（P節の比較群、および今回追加したcoin_used/coin_remaining/termination_reason=coin_exhaustedを使った分析軸）。
3. 実データ収集を開始し、`research_protocol_version = "v3-coin"`のデータが十分に集まった時点でresearchEligible・coinパラメータの妥当性を再検証する。
