# 血晶抽選エンジン仕様書 (Blood Gem Draw Engine Spec)

- ステータス: **設計中（実装なし）**
- 対象: 物欲センサー検証アプリ / 血晶石マラソン・シミュレーター
- 本ドキュメントは確率・抽選ロジックのみを扱う。UI・実験フロー・10連の表示演出は別文書 `docs/experiment_ui_flow_spec.md` を参照。
- 未確定の数値は `TBD` として明示する。

## 更新履歴

- v0.1〜v0.4: 基本構造・3体の抽選構造・排他処理・ValueSeries/EffectValueBinding分離・EnemyDefinition/GemDataset分離・貞子データセットの骨格を定義。
- v0.5: Fidelity Contractを新設。`completeness`3状態化、`evidence`追加、貞子のEffectPoolをPthumeru標準プールへの参照として確定。
- v0.6: `pthumeru_standard_secondary_pool`をNative/OOEに区別（暫定値）。`EffectPool`に`nativeEntries`/`ooeEntries`を追加。`DrawEngine`に`draw(dataset, count)`追加。
- v0.7: `pthumeru_standard_secondary_pool`をNative7種＋OOE12種＝19項目・合計100.0000%の確定値で更新。`EffectPoolEntry`に`verificationStatus`を追加（確率値ごとに保持）。この19項目は全項目`evidence: "reverse_engineered"` / `verificationStatus: "provisional"`とした。Primary/Secondaryの同一effectId重複11件を確定し、`physical`と`odd_physical`等の別effect扱いを明記。貞子の`completeness.probability`を`complete`へ更新（`displayValues`は引き続き`partial`）。
- v0.8: `verificationStatus`の意味を一般化（「公式仕様相当」限定ではなく、値の確信度の指標とし、直接datamine一致／大規模実測と整合するreverse-engineeredモデル／複数独立ソースの一致、のいずれかを満たせば`confirmed`へ昇格可能と明記）。`evidence`を単一値から**配列**へ変更（複数の根拠を同時に保持可能に）。新規フィールド`EffectPool.researchUseStatus`（`allowed` / `allowed_with_note` / `disallowed`）を追加し、研究モードのTarget選択可否を「プールレベルのゲート（`researchUseStatus`）」と「値レベルのゲート（`ValueSeries`各rankの`verificationStatus`）」という独立した2判定に分離。`pthumeru_standard_secondary_pool`に`researchUseStatus: "allowed"`を設定し、`evidence: ["reverse_engineered", "farm_validated"]`とした。Fidelity Contractに研究レポートでの文言指定を追加。v0.7で提起した「貞子secondaryが研究モードで一件も選択できなくなる」という未確定事項はこの変更で解消（7.1節）。また、v0.7で一部節が誤って本文なしの見出しのみになっていた不備（3.1・3.2・3.3・3.4・4.2・6.1・8・9・10節）を復元。
- v0.9: 赤オーラ貞子のPrimary18項目・Secondary18項目について、実ドロップ資料で確認できる**R18のみ**を`confirmed`/`evidence: ["farm_validated"]`としてValueSeriesに正式登録（5.2.3節）。R16/R17は、対応する候補数値系列（datamined `manastone_effect`）が存在していても、貞子の各Ratingへの対応が直接確認されるまで`unknown`のまま据え置き、逆算・按分では埋めない。DrawEngineの抽選自体はR16/R17を含め通常どおり行い、`displayValue: unknown`のまま`effectId`・`rank`は正常に生成する（再正規化しない）ことを明記。この結果、7.1節の値レベルのゲートにより、貞子のR18最高値のみが研究モードでTarget選択可能になった。5.2.1節にsourceMetaを3件追加（実ドロップ記録・datamine候補系列・Secondary独立抽選構造の出典）。
- v0.10: 5.2.3節で提起した命名の整合性問題を解消。`bloodtinge_scaling`（v0.4記録）と`warm_blt_scaling`（v0.9採用）は同一効果（Bloodtinge scaling UP／血質補正UP）であることが確認された。3デブ側でも使用している`warm_blt_scaling`を正式effectIdとして維持し、`bloodtinge_scaling`は表示上のaliasとして扱う（データ構造への変更はなし）。あわせて`blood`（Blood ATK UP／血の攻撃力UP）は`warm_blt_scaling`とは別効果であることを確認・明記。
- v0.11: 赤オーラ貞子のPrimary7項目・Secondary9項目について、`manastone_effect`上の連続ValueSeriesとRating規則（Depth5/赤オーラ）・強化Secondary構造・実ドロップ検算の複合根拠により、R16/R17/R18を一括で`confirmed`へ昇格（5.2.4節、いわゆる「第一確定グループ」）。evidenceはrankごとに`game_param_datamined`/`farm_validated`を使い分けて配列登録。PrimaryとSecondaryのValue Rankが独立抽選である点を明記。残りのPrimary16項目・Secondary10項目は現状維持（第二段階で個別確認予定）。7.1節に適用例を追加。
- v0.12: 3体目の敵、女幽霊（`evil_labyrinth_spirit`）のEnemyDefinition/GemDataset骨格を追加（5.3節）。secondarySlot="fixed"（`poorman_physical`固定、種類抽選なし）、Rating候補R15/R16/R17（各1/3）、`allowDuplicateSecondary: true`（primaryとfixed secondaryの同一effectId重複を許可）。ValueTable系列の逆転（random primaryはSec.1系列、fixed secondaryはPrim.1系列）を、女幽霊専用の分岐を作らず既存のEffectValueBinding（3.2節）で表現。R17実ドロップ3例（physical/striking_charge/poorman_physicalの各primary×fixed secondary=poorman_physical 27%）をconfirmed登録し、Primary/fixedSecondaryのValue Rank独立抽選の実測根拠とした。R15/R16は候補値（25%/26%）を含め引き続きunknown。

---

## Fidelity Contract（適用範囲と忠実性の宣言）

**目標は「Bloodborneらしい確率」ではなく、現時点で確認できる解析モデルどおりの再現である。** 近似値・簡略化は原則使用しない。

### 再現範囲

```
P(血晶の内容 | 選択した敵から血晶1個を取得した)
```

敵が血晶をドロップする確率（`gemDropRate`）は含めない。将来の実プレイ再現モードでのみ独立レイヤーとして追加できる。

### 確率データの優先順位

1. raw weightが判明していればそれを使う。2. 判明していなければ公開された丸め済みpercent値を使う。3. 同一プール内でweight方式とpercent方式を混在させない。

### 未確定データを理由に確率分布を変更しない

`unknown`/`provisional`な候補をプールから削除して残りを100%へ再正規化することはしない。候補自体の出現確率が未確定な場合は`null`のままプールに残し、そのデータセットは実際の抽選に使用できないことを`completeness.probability`で明示する。**合計が丸め上ちょうど100%になったこと自体は、値の正しさが証明されたことを意味しない**（v0.7で確認したPthumeru標準secondary poolのように）。この原則はdisplayValue（ValueSeries側）にも同様に適用される: 表示数値が`unknown`であっても、Rating（rank）自体の抽選プールから当該rankを外して残りに再正規化することはしない（v0.9・5.2.3節の貞子R16/R17参照）。

### confirmed / provisional / unknown の使い分け（v0.8で一般化）

- `verificationStatus`は「ゲーム公式仕様相当かどうか」に限定されない、**値ごとの一般的な確信度**を表す指標である。
- `confirmed`への昇格基準（いずれか1つを満たせばよい）:
  1. 直接のparamデータマイン・16進解析等、ゲーム内部データへの直接アクセスに基づく値と一致する。
  2. reverse-engineeredモデル（推定式）による算出値が、大規模な実測データと高い一致率で整合している。
  3. 独立した複数のソース（データマイン系・実測集計系・複数の解析者など）が互いに矛盾なく同じ値に到達している。
- `provisional`: 上記いずれの昇格基準も満たさない、単一の推定式・逆算モデルのみに基づく値。
- `unknown`: 値そのものが未取得。

この基準はあくまで「値そのものの確信度」を表すものであり、後述の`researchUseStatus`（研究モードでの利用可否）とは**独立した軸**である。`verificationStatus`が`provisional`のままでも、`researchUseStatus`によって研究モードでの利用が許可される場合がある（7.1節）。

例: 3デブのprimary EffectPool（Tomb Prospectors Hex Researchの直接datamine）は基準1を満たし`confirmed`。貞子のsecondary EffectPoolの確率値（Tomb Prospectors系reverse-engineered gem pool formula、2万個以上の実測血晶との高い一致が報告）は基準2に該当しうるが、本仕様書では現時点で`provisional`のまま据え置く（個別の昇格判断は今後、必要に応じて行う）。一方、貞子のR18表示値（実ドロップ資料由来）は基準1（実測記録との直接一致）に相当するため`confirmed`とする（5.2.3節）。

### researchEligibleの境界

`researchEligible`はユーザーが実験の目標として選べるかどうかを制御するUI層の判定であり、**DrawEngineの抽選プールそのものは一切変更しない**。

### 研究レポートにおける文言（v0.8で追加）

本アプリの確率モデルは、Bloodborne公式が公開した確率ではない。研究レポート等で言及する際は、以下の表現を用いる。

> 「ゲームデータ解析およびTomb Prospectorsによるreverse-engineeringと実測検証に基づく確率モデル」

「Bloodborne公式が公開した確率」という表現は使用しない。データが非公式解析に基づく旨の注記は、アプリ内でのTarget選択をブロックする理由にはせず、研究レポートの方法論・限界（Limitations）セクションに記載する。

---

## 0. 全体像

```
EnemyDefinition          (敵種の構造。聖杯条件に依存しない)
GemDataset                (聖杯条件ごとの確率・数値データ。completeness: {probability, displayValues})
DrawEngine（ステートレス）
 ├─ draw(dataset, count = 10) -> BloodGem[]
 ├─ getEligibleCurses(dataset, primaryEffect, secondaryEffect?) -> weighted CursePool
 └─ computeProbability(dataset, target) -> ProbabilityBreakdown
```

累計ロール番号の付与・Target一致検出・表示演出はExperiment Flow層（`docs/experiment_ui_flow_spec.md`）の責務。

---

## 1. 基本構造

### 1.1 EnemyDefinition と GemDataset

```
EnemyDefinition {
  enemyId: string
  displayName: string
  secondarySlot: "none" | "selectable" | "fixed"
  fixedSecondaryEffectId?: string
  allowDuplicateSecondary: boolean
}

GemDataset {
  datasetId: string
  enemyId: string
  chaliceProfile: string
  shapeTableRef: string
  effectPoolRef: { primary: string, secondary?: string }
  cursePoolRef: string
  conflictGroupSetRef: string
  primaryRankTiers: [number, number, number]
  secondaryRankTiers?: [number, number, number]
  effectValueBindings: EffectValueBinding[]
  sourceMeta: SourceMeta[]
  completeness: {
    probability: "not_started" | "partial" | "complete"
    displayValues: "not_started" | "partial" | "complete"
  }
  dataVersion: string
}
```

### 1.2 各データ型の責務（既存のまま）

| データ型 | 責務 |
|---|---|
| `ShapeTable` | 産地ごとの形状出現確率。 |
| `EffectPool` | あるスロットで、どの効果がどの確率で出るか。`nativeEntries`/`ooeEntries`に分かれる（3.5節）。 |
| `ValueSeries` | 数値カーブ。ランクごとに`value`・`verificationStatus`・`evidence`。 |
| `EffectValueBinding` | 敵×スロット×効果 → ValueSeries + unit + displayFormat。 |
| `CursePool` / `EffectConflictGroup` | 呪いの候補・weightと、正効果↔curseの対応関係。 |

### 1.3 CursePool と EffectConflictGroup（v0.8でevidenceを配列化）

```
cursePoolId: "pthumeru_standard_curse_pool"
entries: [
  { curseId: "stamina_cost_up",   weight: 1, evidence: ["game_param_datamined"] },
  { curseId: "kin_attack_down",   weight: 1, evidence: ["game_param_datamined"] },
  { curseId: "beast_attack_down", weight: 1, evidence: ["game_param_datamined"] },
  { curseId: "durability_down",   weight: 1, evidence: ["game_param_datamined"] },
  { curseId: "hp_deplete",        weight: 1, evidence: ["game_param_datamined"] },
  { curseId: "attack_down",       weight: 1, evidence: ["game_param_datamined"] },
]

conflictGroupSetRef "pthumeru_common_conflict_groups":
[
  { conflictGroupId: "stamina",     positiveEffectId: "radiant_stamina",   negativeCurseId: "stamina_cost_up" },
  { conflictGroupId: "kin",         positiveEffectId: "kinhunter",         negativeCurseId: "kin_attack_down" },
  { conflictGroupId: "beast",       positiveEffectId: "beasthunter",       negativeCurseId: "beast_attack_down" },
  { conflictGroupId: "durability",  positiveEffectId: "dense_durability",  negativeCurseId: "durability_down" },
  { conflictGroupId: "hp_regen",    positiveEffectId: "pulsing_hp_regen",  negativeCurseId: "hp_deplete" },
  { conflictGroupId: "attack_up",   positiveEffectId: "nourishing",        negativeCurseId: "attack_down" },
]
```

---

## 2. 3体の抽選構造（既存のまま）

| 敵 | 構造 | secondarySlot |
|---|---|---|
| 3デブ | `shape → primaryEffect → primaryValue → curse` | `none` |
| 貞子 | `shape → primaryEffect → primaryValue → secondaryEffect → secondaryValue → curse` | `selectable` |
| 女幽霊 | `shape → primaryEffect → primaryValue → fixedSecondaryValue → curse` | `fixed` |

---

## 3. EffectPool・ValueSeries・EffectValueBindingの分離

### 3.1 ValueSeries: 値単位でverificationStatusとevidenceを持つ（v0.8でevidenceを配列化）

```
ValueSeries {
  valueSeriesId: string
  valuesByRank: {
    [rank: number]: {
      value: number | null
      verificationStatus: "confirmed" | "provisional" | "unknown"
      evidence?: ("game_param_datamined" | "reverse_engineered" | "farm_validated" | "provisional")[]
    }
  }
}

3デブの`physical`が使う`curve_25_3_26_3_27_2`:
valuesByRank: {
  17: { value: 25.3, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  18: { value: 26.3, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  19: { value: 27.2, verificationStatus: "confirmed", evidence: ["game_param_datamined"] }
}

dirty_rapid_poison（R17/R18未確定、R19確定）:
valuesByRank: {
  17: { value: null, verificationStatus: "unknown" },
  18: { value: null, verificationStatus: "unknown" },
  19: { value: 21.7, verificationStatus: "confirmed", evidence: ["farm_validated"] }
}
（murky_slow_poisonも同様。R19=18.1のみconfirmed/farm_validated。既存全エントリへのevidence網羅的付与は未着手。）

同一スロット内で複数の効果が同じ数値カーブを共有する例（3デブ）:
- 25.3/26.3/27.2: physical, heavy_str_scaling, sharp_skl_scaling, fire, arcane, bolt, cold_arc_scaling, warm_blt_scaling
- 30.4/31.5/32.6: adept_blunt, adept_thrust, beasthunter, kinhunter, blood
- 33.8/35.0/36.3: striking_charge, poorman_physical
```

貞子のように、一部rankのみ`confirmed`で他rankが`unknown`のケースの扱いは5.2.3節を参照。

### 3.2 EffectValueBinding

```
EffectValueBinding {
  slot: "primary" | "secondary"
  effectId: string
  valueSeriesId: string
  unit: "percent" | "scaling" | "percent_reduction" | "buildup" | "hp_regen"
  displayFormat?: { suffix?: string, decimalPlaces?: number, showSign?: boolean }
}
```

### 3.3 女幽霊のスロット横断参照

女幽霊の固定secondary（貧者物理）はPrim.1相当、ランダムprimaryはSec.1相当の数値系列を使う。EffectValueBindingがslotごとに独立してvalueSeriesIdを指すため特別扱いせず表現できる。

### 3.4 Curseの実数値について（未確定）

curseValueSeriesRef = TBDのまま。3デブの実ドロップ参考値（ATK DOWN約-8.2%等）は参考情報のみで採用しない。成功判定にcurseの実数値は使わない。

### 3.5 EffectPool: nativeEntries / ooeEntries、weight/probabilityPct、verificationStatus、researchUseStatus（v0.8で拡張）

```
EffectPool {
  effectPoolId: string
  nativeEntries: EffectPoolEntry[]
  ooeEntries: EffectPoolEntry[]
  researchUseStatus: "allowed" | "allowed_with_note" | "disallowed"   // v0.8で追加: プールレベルの研究利用可否ゲート（7.1節）
  researchUseNote?: string                                            // allowed_with_note等の場合の根拠・注記
}

EffectPoolEntry {
  effectId: string
  weight?: number
  probabilityPct?: number
  verificationStatus: "confirmed" | "provisional" | "unknown"
  evidence?: ("game_param_datamined" | "reverse_engineered" | "farm_validated" | "provisional")[]   // v0.8で配列化
}
```

正規化は`nativeEntries`と`ooeEntries`を合わせた全体の合計に対する比で行う。**`ooeEntries`に`null`が1件でもあれば実際の抽選に使用できない**。

`pthumeru_standard_primary_pool`（3デブ・貞子で共有）: nativeEntries 9項目・ooeEntries 14項目、全項目`verificationStatus: "confirmed"` / `evidence: ["game_param_datamined"]`（Tomb Prospectors Hex Researchの直接datamine）。`researchUseStatus: "allowed"`（直接datamineによる`confirmed`のため）。

`pthumeru_standard_secondary_pool`（v0.7で確率が確定。v0.8で`researchUseStatus`を追加。貞子で使用）:

**nativeEntries（7項目、合計98.4483%）**

```
odd_physical       41.2413%
dense_durability   12.2499%
radiant_stamina    12.2499%
striking_charge    12.2499%
open_foes          12.2499%
poorman_physical    4.1241%
fools_physical      4.0833%
```

**ooeEntries（12項目、合計1.5517%）**

```
murky_slow_poison   0.2450%
dirty_rapid_poison  0.2450%
rally_potential     0.2042%
odd_bolt            0.2042%
odd_fire            0.2042%
pulsing_hp_regen    0.1225%
beasthunter         0.0817%
kinhunter           0.0817%
odd_arcane          0.0408%
fools_all           0.0408%
odd_blood           0.0408%
poorman_all         0.0408%
```

**合計: 98.4483% + 1.5517% = 100.0000%（検算済み。19項目、ID重複なし）。**

全19項目とも `verificationStatus: "provisional"` / `evidence: ["reverse_engineered", "farm_validated"]`（v0.8で配列化）とする。Native/OOEの分類自体はBloodborne Wiki（Tomb Prospectors gemCategory解析に基づく）で確認できるが、個々の確率値はTomb Prospectors系reverse-engineered gem pool formulaによる算出値であり、2万個以上の実測血晶との高い一致が報告されているものの、ゲーム公式の保証値ではないため`verificationStatus`は`provisional`のまま据え置く。ただし推定式（reverse_engineered）であると同時に大規模実測（farm_validated）による裏付けもあるため、根拠を両方とも`evidence`配列に保持する。

`researchUseStatus: "allowed"`（v0.8で追加）。理由: Tomb Prospectorsの分析に基づくreverse-engineeredモデルであり、大規模実測とも整合しており、19項目のプールが合計100.0000%で完結しているため。「非公式解析に基づく」旨は研究レポートのLimitationsに記載し、アプリ内のTarget選択はブロックしない（Fidelity Contract参照）。

> **v0.7で提起した未確定事項はv0.8で解消**: 「`verificationStatus: confirmed`のみ研究利用可」という一律基準は撤廃した。プールレベルの`researchUseStatus`（このEffectPool自体を研究モードのTarget候補に含めてよいか）と、値レベルの`verificationStatus`（`ValueSeries`側、具体的な数値まで確定的にTargetにしてよいか）を、独立した2つの判定として評価する方式に変更した。詳細は7.1節を参照。

---

## 4. 排他と再正規化

### 4.1 primary/secondaryの排他（v0.7でID衝突を確定）

```
P(secondaryEffect = Y | primaryEffect = X)
  = 0                                          if Y == X and not allowDuplicateSecondary
  = p_secondary(Y) / (1 - p_secondary(X))      otherwise
```

`pthumeru_standard_primary_pool`と`pthumeru_standard_secondary_pool`で**同一effectIdが重なる11件**（検算済み）:

```
striking_charge, radiant_stamina, poorman_physical, fools_physical,
murky_slow_poison, dirty_rapid_poison, pulsing_hp_regen,
beasthunter, kinhunter, fools_all, poorman_all
```

これらがprimaryに選ばれていた場合、secondary側の同じeffectIdは除外・再正規化の対象になる（例: `primary = striking_charge` のとき `secondary = striking_charge` は不可）。

**別効果として明確に区別する（IDが異なるため排他は発生しない）**:

```
physical (primary)   ⇔ odd_physical (secondary)
arcane (primary)     ⇔ odd_arcane (secondary)
fire (primary)       ⇔ odd_fire (secondary)
bolt (primary)       ⇔ odd_bolt (secondary)
blood (primary)      ⇔ odd_blood (secondary)
```

例: 貞子で`Physical ATK UP +21%`（primary）と`Add Physical ATK +18.9`（secondary＝`odd_physical`）は同時に成立する。

`dense_durability` / `open_foes`はsecondaryにのみ存在し、primary側に対応するIDがないため排他判定の対象外（常にeligible）。

### 4.2 呪いの排他（確定）

```
getEligibleCurses(cursePool, conflictGroups, primaryEffectId, secondaryEffectId?):
    excluded = conflictGroups.filter(g => g.positiveEffectId in {primaryEffectId, secondaryEffectId})
                              .map(g => g.negativeCurseId)
    return cursePool.entries.filter(e => e.curseId not in excluded)

P(curse = Y | primary, secondary) = weight(Y) / sum(weight(e) for e in eligible)
P(curse ∈ acceptedCurses | ...) = sum(weight(e) for e in eligible if e.curseId in acceptedCurses) / sum(weight(e) for e in eligible)
```

---

## 5. データセット別の状況

### 5.1 3デブ（`pthumeru_depth5_standard_watchers_v0_1`）

```
effectPoolRef: { primary: "pthumeru_standard_primary_pool" }
completeness: { probability: "complete", displayValues: "partial" }
```

残るTBD: `dirty_rapid_poison`/`murky_slow_poison`のR17/R18、curseの実数値ValueSeries。

### 5.2 貞子（`pthumeru_depth5_red_aura_madman_v0_1`）

```
EnemyDefinition {
  enemyId: "labyrinth_madman", displayName: "貞子",
  secondarySlot: "selectable", allowDuplicateSecondary: false
}

GemDataset {
  datasetId: "pthumeru_depth5_red_aura_madman_v0_1",
  enemyId: "labyrinth_madman",
  chaliceProfile: "pthumeru_ihyll_depth5_standard",
  shapeTableRef: "PthumeruShapeTable",
  effectPoolRef: { primary: "pthumeru_standard_primary_pool", secondary: "pthumeru_standard_secondary_pool" },
  cursePoolRef: "pthumeru_standard_curse_pool",
  conflictGroupSetRef: "pthumeru_common_conflict_groups",
  primaryRankTiers: [16, 17, 18],
  secondaryRankTiers: [16, 17, 18],
  effectValueBindings: [ /* 5.2.3節: R18のみ確定分 / 5.2.4節: Primary7項目・Secondary9項目はR16-R18フル確定 */ ],
  sourceMeta: [ /* 5.2.1節参照 */ ],
  completeness: { probability: "complete", displayValues: "partial" },   // v0.11時点でも一部effectのみフル確定のためdisplayValuesはpartial
  dataVersion: "v0.11-primary7-secondary9-full-confirmed"
}
```

**`completeness.probability`が`complete`に到達した理由**: primary EffectPool（既存・確定）、secondary EffectPool（v0.7で19項目・100.0000%が確定）、CursePool、ConflictGroupSet、primary/secondaryのRankTiersがすべて揃い、「どの1op・2op・呪いが、どの確率で出るか」を計算するために欠けている情報がなくなったため。ただし全確率値の`verificationStatus`は`provisional`であり、**「ゲーム公式相当に確定した」という意味ではない**（Fidelity Contract参照）。なお、この`provisional`という評価のままでも、v0.8で追加した`researchUseStatus`（secondaryプールは`allowed`）により、研究モードでのTarget選択自体は可能になっている（3.5節・7.1節）。`displayValues`（実際のBloodborne表示数値・ValueSeries）は、v0.9でPrimary/Secondary各18項目のR18が`confirmed`になり、v0.11でそのうちPrimary7項目・Secondary9項目はR16/R17も`confirmed`となったが、Primary23項目・Secondary19項目のうち一部にとどまるため引き続き`partial`。

#### 5.2.1 出典（v0.7で追加、v0.9で3件追加）

```
[
  { sourceId: "bloodborne_wiki_secondary_stats", sourceType: "wiki",
    verificationStatus: "confirmed",
    appliesTo: ["effectPool.secondary.classification"] },  // Native7種の分類そのものはWikiで確認可能
  { sourceId: "tomb_prospectors_reverse_engineered_secondary_formula", sourceType: "tool",
    verificationStatus: "provisional", sourcePrecision: "published_4_decimal_percent",
    appliesTo: ["effectPool.secondary.probabilityPct"] },   // 個々の確率値はreverse-engineeredモデル
  { sourceId: "souruzu_nikki_blood_gem_drop_rate", sourceType: "wiki",
    verificationStatus: "provisional",
    appliesTo: ["effectPool.secondary.probabilityPct"] },   // 日本語での同一算出表（傍証）
  { sourceId: "ninni066_blood_gems_drop_rate", sourceType: "other",
    verificationStatus: "provisional",
    appliesTo: ["effectPool.secondary.probabilityPct"] },
  { sourceId: "bloodborne_wiki_labyrinth_madmen_drop_list", sourceType: "wiki",
    verificationStatus: "confirmed",
    appliesTo: ["valueSeries.primary.rank18", "valueSeries.secondary.rank18"] },   // v0.9追加: R18実ドロップ記録
  { sourceId: "bloodborne_wiki_datamined_manastone_effect", sourceType: "datamine",
    verificationStatus: "provisional",
    appliesTo: ["valueSeries.candidateSeries"] },   // v0.9追加: R16/R17候補系列（対応未確定・参考情報のみ）
  { sourceId: "bloodborne_wiki_how_are_blood_gems_determined", sourceType: "wiki",
    verificationStatus: "confirmed",
    appliesTo: ["structure.secondaryRatingIndependentDraw", "structure.prim2Sec2Notation"] }   // v0.9追加: Secondary Rating独立抽選・Prim.2/Sec.2表記の出典
]
```

#### 5.2.2 確認済み参考情報（存在＋最高値のみ。ValueSeriesとしては未確定だった段階の記録）

Primary: `physical 21.0% / adept_blunt 25.2% / adept_thrust 25.2% / bloodtinge_scaling +21 / striking_charge 28.0% / radiant_stamina 7.0%減 / poorman_physical 28.0% / fools_physical 26.6% / fire 21.0% / heavy_str_scaling +21 / sharp_skl_scaling +21 / arcane 21.0% / pulsing_hp_regen +4 / kinhunter 25.2% / beasthunter 25.2% / bolt 21.0% / dirty_rapid_poison +16.8 / murky_slow_poison +14 / nourishing +18.2%`

Secondary: `striking_charge 12.6% / open_foes 12.6% / dense_durability +12.6 / odd_physical +18.9 / radiant_stamina 3.2%減 / fools_physical 12.0% / poorman_physical 12.6% / poorman_all 10.3% / murky_slow_poison +6.3 / dirty_rapid_poison +7.5 / odd_arcane +31.5 / odd_fire +31.5 / odd_bolt +31.5 / odd_blood +14.6 / pulsing_hp_regen +2 / rally_potential 6.3% / beasthunter 11.3% / kinhunter 11.3%`

`+17.6/+18.2/+18.9`系列は効果・ランク対応が未確定のまま保持する。

**用語の補足（v0.10）**: 上記`bloodtinge_scaling`は正式effectId`warm_blt_scaling`のalias（同一効果）であることが確認済み。5.2.3節参照。

**v0.9での位置づけ**: この節に記録されていた最高値は、5.2.3節でR18として正式に`confirmed`登録された。この節は「どういう経緯でR18値に辿り着いたか」の記録として残す。

#### 5.2.3 Primary/Secondary ValueSeries: R18確定値（v0.9で追加）

実ドロップ資料（Bloodborne Wiki "The Labyrinth Madmen Drop List"）で確認できる最高値のみを`confirmed`としてValueSeriesに登録する。R16/R17は、対応する候補数値系列（datamined `manastone_effect`、例: `odd_physical`の`+17.6/+18.2/+18.9`）が存在していても、貞子の各Ratingへの対応が直接確認できるまで`unknown`のまま保持し、逆算・按分・比例配分で埋めない。

```
ValueSeries {
  valueSeriesId: string   // 貞子専用。効果ごとに1つ（R16/R17系列が未確定のため、3デブのような複数効果共有カーブとしてはまだ組めない）
  valuesByRank: {
    16: { value: null, verificationStatus: "unknown" },
    17: { value: null, verificationStatus: "unknown" },
    18: { value: <R18値>, verificationStatus: "confirmed", evidence: ["farm_validated"] }
  }
}
```

**Primary（18項目、R18 confirmed / farm_validated）**

| effectId | R18 |
|---|---|
| physical | 21.0% |
| adept_blunt | 25.2% |
| adept_thrust | 25.2% |
| warm_blt_scaling | +21 |
| striking_charge | 28.0% |
| radiant_stamina | 7.0%減 |
| poorman_physical | 28.0% |
| fools_physical | 26.6% |
| fire | 21.0% |
| heavy_str_scaling | +21 |
| sharp_skl_scaling | +21 |
| arcane | 21.0% |
| pulsing_hp_regen | +4 |
| kinhunter | 25.2% |
| beasthunter | 25.2% |
| bolt | 21.0% |
| dirty_rapid_poison | +16.8 |
| murky_slow_poison | +14 |

※ このうち7項目（`physical`/`adept_blunt`/`adept_thrust`/`striking_charge`/`radiant_stamina`/`fools_physical`/`poorman_physical`）は、v0.11でR16/R17も含めてフルセットで`confirmed`に昇格した（5.2.4節）。

**Primary（5項目、R18も引き続きTBD。今回の実ドロップ資料に掲載なし。EffectPoolからは削除しない）**

```
cold_arc_scaling, fools_all, nourishing, blood, poorman_all
```

**Secondary（18項目、R18 confirmed / farm_validated）**

| effectId | R18 |
|---|---|
| striking_charge | 12.6% |
| open_foes | 12.6% |
| dense_durability | +12.6 |
| odd_physical | +18.9 |
| radiant_stamina | 3.2%減 |
| fools_physical | 12.0% |
| poorman_physical | 12.6% |
| poorman_all | 10.3% |
| murky_slow_poison | +6.3 |
| dirty_rapid_poison | +7.5 |
| odd_arcane | +31.5 |
| odd_fire | +31.5 |
| odd_bolt | +31.5 |
| odd_blood | +14.6 |
| pulsing_hp_regen | +2 |
| rally_potential | 6.3% |
| beasthunter | 11.3% |
| kinhunter | 11.3% |

※ このうち9項目（`odd_physical`/`striking_charge`/`dense_durability`/`open_foes`/`poorman_physical`/`fools_physical`/`radiant_stamina`/`beasthunter`/`kinhunter`）は、v0.11でR16/R17も含めてフルセットで`confirmed`に昇格した（5.2.4節）。

**Secondary（1項目、引き続きTBD）**: `fools_all`（今回の実ドロップ一覧に掲載なし。EffectPoolからは除外しない）

**Datamined候補系列（例: `odd_physical`の`+17.6/+18.2/+18.9`）について**: `manastone_effect`には自然な連続数値系列が存在するが、`+17.6=R16 / +18.2=R17 / +18.9=R18`のようなrankへの割り当てを本仕様書では確定させない。Primaryの`19.5/20.3/21.0`・`23.4/24.3/25.2`等の類似系列も同様に、現時点では候補情報としてのみ記録し、正式ValueSeriesにはしない。

**DrawEngine上の扱い**: 貞子のRating抽選（R16/R17/R18）はdisplayValueの確定状況に関わらず常に3値とも存在する。DrawEngineがR16またはR17を引いた場合も、`effectId`と`valueRank`は通常どおり生成し、`displayValue: unknown`として扱う（例: `{ effectId: "physical", valueRank: 16, displayValue: unknown }`）。「表示値が不明だから」という理由でR18のみに1/1で再正規化することはしない。

> **命名の整合性について（v0.10で解消）**: 5.2.2節（v0.4時点）で`bloodtinge_scaling`と記載していた効果は、`warm_blt_scaling`（Bloodtinge scaling UP／血質補正UP）と同一効果であることが確認された。3デブ側でも使用している`warm_blt_scaling`を正式effectIdとして維持し、`bloodtinge_scaling`は表示上のaliasとして扱う。なお`blood`（Blood ATK UP／血の攻撃力UP）は`warm_blt_scaling`とは別効果であり、混同しない。

#### 5.2.4 Primary/Secondary ValueSeries: 第一確定グループ（R16/R17/R18、v0.11で追加）

貞子はDepth 5の赤オーラLabyrinth Madmanであり、R16/R17/R18の3 Ratingを取り得る。また、通常のLabyrinth Madmanより強化されたSecondaryを持つ代わりにPrimaryが弱いという解析結果があり、SecondaryのValue RankはPrimaryとは独立に、同じ3 Rating相当から抽選される。

`manastone_effect`上には、実際のMadman最高値と一致するR16/R17/R18相当の連続ValueSeriesが存在し、複数の中間値が実ドロップ報告とも一致している効果について、今回「第一確定グループ」としてR16/R17/R18をまとめて`confirmed`へ昇格させる。「3 Rankすべてに個別の実測例が存在すること」は`confirmed`の必須条件とはせず、以下4点の複合根拠で判断する（Fidelity Contractの`confirmed`昇格基準、特に基準3「複数独立ソースの一致」に相当）:

1. Depth 5・赤オーラによるR16-R18というRating規則
2. Labyrinth Madmanの強化Secondary構造（解析による構造的裏付け）
3. `manastone_effect`上の対応ValueSeries（連続する数値系列）
4. R17/R18等の実ドロップによる検算（Bloodborne Wiki "The Labyrinth Madmen Drop List"）

```
ValueSeries {
  valueSeriesId: string
  valuesByRank: {
    16: { value: <R16値>, verificationStatus: "confirmed", evidence: [...] },
    17: { value: <R17値>, verificationStatus: "confirmed", evidence: [...] },
    18: { value: <R18値>, verificationStatus: "confirmed", evidence: [...] }
  }
}

例（Primary physical）:
valuesByRank: {
  16: { value: 19.5, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  17: { value: 20.3, verificationStatus: "confirmed", evidence: ["game_param_datamined", "farm_validated"] },
  18: { value: 21.0, verificationStatus: "confirmed", evidence: ["game_param_datamined", "farm_validated"] }
}
```

**Primary（7項目、R16/R17/R18すべてconfirmed）**

| effectId | R16 | R17 | R18 |
|---|---|---|---|
| physical | 19.5% | 20.3% | 21.0% |
| adept_blunt | 23.4% | 24.3% | 25.2% |
| adept_thrust | 23.4% | 24.3% | 25.2% |
| striking_charge | 26.0% | 27.0% | 28.0% |
| radiant_stamina | 6.5%減 | 6.8%減 | 7.0%減 |
| fools_physical | 24.7% | 25.7% | 26.6% |
| poorman_physical | 26.0% | 27.0% | 28.0% |

**Secondary（9項目、R16/R17/R18すべてconfirmed）**

| effectId | R16 | R17 | R18 |
|---|---|---|---|
| odd_physical | +17.6 | +18.2 | +18.9 |
| striking_charge | 11.7% | 12.2% | 12.6% |
| dense_durability | +11.7 | +12.2 | +12.6 |
| open_foes | 11.7% | 12.2% | 12.6% |
| poorman_physical | 11.7% | 12.2% | 12.6% |
| fools_physical | 11.1% | 11.5% | 12.0% |
| radiant_stamina | 2.9%減 | 3.0%減 | 3.2%減 |
| beasthunter | 10.5% | 10.9% | 11.3% |
| kinhunter | 10.5% | 10.9% | 11.3% |

**evidenceの割り当て**: 全rankとも`game_param_datamined`（`manastone_effect`の連続系列との一致）を基本evidenceとする。加えて、R18は既存のドロップ記録（5.2.1節）により全effectで`farm_validated`も併記する。R17については、実ドロップ報告と個別に照合されている`physical`（primary）・`striking_charge`（secondary）のみ`farm_validated`を追加する。それ以外のR16・R17は現時点では`game_param_datamined`のみとし、根拠を過大に見積もらない。

※ R18値は5.2.3節で既に`confirmed`登録済みの値と完全に一致することを確認済み（本節はR16/R17を追加し、Primary7項目・Secondary9項目をフルセット化するもの）。

**独立Rating抽選（重要、v0.11で明記）**: PrimaryのRankとSecondaryのRankは同じ値に固定されない。例えば「Primary = `physical` R17（20.3%）× Secondary = `striking_charge` R18（12.6%）」や「Primary = `physical` R18（21.0%）× Secondary = `striking_charge` R17（12.2%）」のような組み合わせも発生する。DrawEngineは`primaryValueRank`と`secondaryValueRank`を必ず独立に抽選すること（1.1節のGemDatasetが両者を別フィールドとして持つ設計は既にこれに対応している）。

**今回確定しないもの（現状維持）**: 上記7項目（Primary）・9項目（Secondary）以外は、候補ValueSeriesが存在していても今回は昇格させない。内訳は5.2.3節のとおり: Primaryは11項目（`warm_blt_scaling`/`fire`/`heavy_str_scaling`/`sharp_skl_scaling`/`arcane`/`pulsing_hp_regen`/`kinhunter`/`beasthunter`/`bolt`/`dirty_rapid_poison`/`murky_slow_poison`）がR18のみ`confirmed`のまま、5項目（`cold_arc_scaling`/`fools_all`/`nourishing`/`blood`/`poorman_all`）がR18も含め引き続きTBD。Secondaryは9項目（`poorman_all`/`murky_slow_poison`/`dirty_rapid_poison`/`odd_arcane`/`odd_fire`/`odd_bolt`/`odd_blood`/`pulsing_hp_regen`/`rally_potential`）がR18のみ`confirmed`のまま、1項目（`fools_all`）がR18も含め引き続きTBD。これらは第二段階で個別に確認予定。

**次のデータ提供予定（v0.11時点）**: 残るPrimary16項目・Secondary10項目のR16/R17/R18を、個別確認できたものから順次提供予定。

### 5.3 女幽霊（`pthumeru_depth5_standard_evil_spirit_v0_1`）

```
EnemyDefinition {
  enemyId: "evil_labyrinth_spirit", displayName: "女幽霊",
  secondarySlot: "fixed", fixedSecondaryEffectId: "poorman_physical",
  allowDuplicateSecondary: true
}

GemDataset {
  datasetId: "pthumeru_depth5_standard_evil_spirit_v0_1",
  enemyId: "evil_labyrinth_spirit",
  chaliceProfile: "pthumeru_ihyll_depth5_standard",
  shapeTableRef: "PthumeruShapeTable",
  effectPoolRef: { primary: "pthumeru_standard_primary_pool" },   // secondaryは種類抽選が存在しないためrefなし
  cursePoolRef: "pthumeru_standard_curse_pool",
  conflictGroupSetRef: "pthumeru_common_conflict_groups",
  primaryRankTiers: [15, 16, 17],
  secondaryRankTiers: [15, 16, 17],   // fixedSecondaryのValue Rank候補（種類は固定だがRankはprimaryと独立抽選）
  effectValueBindings: [ /* 5.3.2節参照。random primaryはSec.1系列、fixed secondaryはPrim.1系列を使用（3.3節） */ ],
  sourceMeta: [ /* 5.3.1節参照 */ ],
  completeness: { probability: "complete", displayValues: "partial" },
  dataVersion: "v0.12-skeleton-r17-confirmed"
}
```

**secondarySlot = "fixed"の意味**: `P(fixedSecondary = "poorman_physical") = 1`。Secondary Effectの種類抽選は存在しない。ただしfixedSecondaryのValue Rank自体は`primaryValueRank`とは独立に抽選される（`fixedSecondaryValueRank`として別保持。5.3.4節参照）。

**重複例外**: `allowDuplicateSecondary: true`。通常の「primary/secondaryで同一effectId禁止」ルール（4.1節）は女幽霊の固定secondaryには適用しない。`primary = poorman_physical`と`fixedSecondary = poorman_physical`が同時成立する（実ドロップ確認済み、5.3.4節の例3）。

**呪いの排他**: `getEligibleCurses(dataset, primaryEffect, secondaryEffect?)`（0節・4.2節）の`secondaryEffect?`引数に、女幽霊では常に`fixedSecondaryEffectId`（`poorman_physical`）を渡す。ただし`poorman_physical`は`pthumeru_common_conflict_groups`（1.3節）の`positiveEffectId`一覧に含まれないため、それ単独で除外されるcurseはない（検算済み）。

**completeness.probabilityがcompleteである理由**: primary EffectPool（既存・確定）、CursePool、ConflictGroupSet、primaryRankTiersが揃っており、fixedSecondaryは効果の種類が確率1で固定のため種類側の不確実性がない。「どの1op・呪いが、どの確率で出るか」の計算に欠けている情報はない。`displayValues`は、Primary23項目中3項目・FixedSecondary1項目のR17のみが`confirmed`で大部分が未確定のため`partial`。

#### 5.3.1 出典（v0.12で追加）

```
[
  { sourceId: "bloodborne_wiki_evil_labyrinth_spirit_drop_examples", sourceType: "wiki",
    verificationStatus: "confirmed",
    appliesTo: ["valueSeries.primary.rank17", "valueSeries.fixedSecondary.rank17"] },   // R17実ドロップ3例（5.3.4節）
  { sourceId: "bloodborne_wiki_datamined_manastone_effect", sourceType: "datamine",
    verificationStatus: "provisional",
    appliesTo: ["valueSeries.fixedSecondary.candidateSeries"] }   // 固定secondaryのPrim.1候補系列（25%/26%/27%）。5.2.1節と同一sourceIdを再利用
]
```

#### 5.3.2 ValueTable系列の逆転（既存のEffectValueBindingで表現）

女幽霊は、3.2節のEffectValueBindingをそのまま使い、女幽霊専用の分岐（if文）を作らずに以下を表現する（3.3節で既に想定済みの設計）:

- `slot: "primary"`のeffectは、3デブ/貞子のような通常のPrim.1系列ではなく、**Sec.1系列のValueSeries**を参照する。
- `slot: "secondary"`（固定`poorman_physical`）は、通常のSec.1系列ではなく、**Prim.1系列のValueSeries**を参照する。

ValueSeriesはGemDataset単位のEffectValueBinding（1.1節）を介して紐付くため、この「系列の逆転」は女幽霊専用のEffectValueBindingエントリが指す先を切り替えるだけで表現でき、DrawEngine側に女幽霊固有の分岐ロジックは不要。

```
effectValueBindings（女幽霊、確定分のみ）:
[
  { slot: "primary", effectId: "physical",
    valueSeriesId: "evil_spirit_primary_physical_sec1series", unit: "percent" },
  { slot: "primary", effectId: "striking_charge",
    valueSeriesId: "evil_spirit_primary_striking_charge_sec1series", unit: "percent" },
  { slot: "primary", effectId: "poorman_physical",
    valueSeriesId: "evil_spirit_primary_poorman_physical_sec1series", unit: "percent" },
  { slot: "secondary", effectId: "poorman_physical",
    valueSeriesId: "evil_spirit_fixed_secondary_poorman_physical_prim1series", unit: "percent" }
]
```

`pthumeru_standard_primary_pool`には23項目のeffectが存在するが、女幽霊用のSec.1系列ValueSeriesが確認できているのは上記3項目のみ。残り20項目はEffectValueBinding未登録（TBD）。

#### 5.3.3 ValueSeries（R17のみconfirmed、R15/R16はTBD）

```
ValueSeries {
  valueSeriesId: string
  valuesByRank: {
    15: { value: number | null, verificationStatus: "unknown" },
    16: { value: number | null, verificationStatus: "unknown" },
    17: { value: <値>, verificationStatus: "confirmed", evidence: ["farm_validated"] }
  }
}
```

**Primary（Sec.1系列、3項目、R17のみconfirmed）**

| effectId | R15 | R16 | R17 |
|---|---|---|---|
| physical | unknown | unknown | +9.1% |
| striking_charge | unknown | unknown | +12.2% |
| poorman_physical | unknown | unknown | +12.2% |

**Fixed Secondary（Prim.1系列、`poorman_physical`固定、R17のみconfirmed）**

| effectId | R15 | R16 | R17 |
|---|---|---|---|
| poorman_physical（固定） | 25%（候補・unknown） | 26%（候補・unknown） | 27%（confirmed） |

R15=25%・R16=26%は`manastone_effect`上のPrim.1候補系列として存在するが、女幽霊の各Ratingへの直接対応が確認できるまで`unknown`のまま保持し、逆算・按分では埋めない（Fidelity Contract「未確定データを理由に確率分布を変更しない」原則。5.2.3節の貞子R16/R17と同じ扱い）。R17=27%のみ、実ドロップ資料との一致により`confirmed`/`evidence: ["farm_validated"]`とする。

#### 5.3.4 確認済みR17実ドロップ3例（検算用）

以下3例はすべてPthumeru Ihyll・Rating 17の女幽霊産として報告されている。

| # | primary | fixedSecondary |
|---|---|---|
| 1 | `physical` R17 = +9.1% | `poorman_physical` R17 = +27% |
| 2 | `striking_charge` R17 = +12.2% | `poorman_physical` R17 = +27% |
| 3 | `poorman_physical` R17 = +12.2% | `poorman_physical` R17 = +27% |

例3は`primary = poorman_physical`と`fixedSecondary = poorman_physical`が同一血晶内で共存する例であり、`allowDuplicateSecondary: true`の直接的な実測根拠。3例ともfixedSecondaryは常に`poorman_physical R17 = +27%`で一定しており、「Secondary Effectの種類抽選なし・Value Rankのみ独立抽選」という構造と矛盾しない。

**次のデータ提供予定（v0.12時点）**: 女幽霊のPrimary残り20項目のSec.1系列ValueSeries、およびFixed SecondaryのR15/R16の直接対応確認。

---

## 6. 完全一致（成功）の定義（既存のまま）

```
TargetBloodGem {
  datasetId: string
  acceptedShapes: ShapeId[]
  primaryEffectId: string
  acceptedPrimaryRanks: RankId[]
  secondaryEffectId?: string
  acceptedSecondaryRanks?: RankId[]
  acceptedCurses: CurseId[]
  desireScore: 1|2|3|4|5
  researchEligible: boolean
}
```

`researchEligible`（極端に低確率なTargetをUXの都合で研究モードから隠すためのフラグ）と、3.5節・7.1節で導入した`researchUseStatus`（データの確度に基づく研究利用可否のゲート）は**目的の異なる別概念**であり、混同しないこと。

### 6.1 UIでのcurse候補のフィルタリング

getEligibleCursesの結果に基づき、除外されたcurseは選択肢から非表示/disabledにする。研究モード・シミュレーターモード共通。

---

## 7. 研究モードとシミュレーターモードの共通化

DrawEngineはモード非依存。`researchEligible`はTarget選択UIのフィルタのみ。詳細は`docs/experiment_ui_flow_spec.md`参照。

### 7.1 Target選択可否の判定（v0.8で確定：独立した2つのゲート）

研究モードでTargetとして選択できるかどうかは、以下の**独立した2つの判定**の両方を満たす必要がある。どちらか一方だけで判断してはならない。

1. **プールレベルのゲート（`EffectPool.researchUseStatus`）**: そのeffectId自体を研究モードのTarget候補として提示してよいか。`allowed` / `allowed_with_note` / `disallowed`の3値。`verificationStatus`が`confirmed`でなくても、reverse-engineeredモデルが大規模実測と一致している等、十分な根拠があれば`allowed`にできる（Fidelity Contract参照）。
2. **値レベルのゲート（`ValueSeries.valuesByRank[rank].verificationStatus`）**: そのeffectの「具体的な数値」（例: `odd_physical`のR18=+18.9）を研究モードのTargetとして確定的に選択させてよいか。この値自体の`verificationStatus`が`confirmed`のものに限定する。

例（貞子のsecondary `odd_physical`）:
- プールレベル: `pthumeru_standard_secondary_pool.researchUseStatus = "allowed"` → 「2opとして`odd_physical`を狙う」という選択自体は研究モードで可能。
- 値レベル: `odd_physical`のValueSeriesの各rankが`confirmed`になるまでは、「具体的にその数値を狙う」という数値レベルのTarget確定はできない。値が`provisional`/`unknown`のrankは選択不可とし、ValueSeriesが揃うまでは「effectId一致のみ（数値は問わない）」といった粒度のTargetとしてのみ利用可能とする運用になる。

この2つのゲートは、UX上の理由で極端な低確率Targetを非表示にする`researchEligible`（6節）とも独立している。「データの確度（プールレベル）」「値の確度（値レベル）」「UX上の実用性（researchEligible）」という3つの独立した判定がすべて揃って初めて、あるTargetが研究モードで提示される。

#### 適用例: 貞子のR18確定値（v0.9で追加）

5.2.3節でPrimary18項目・Secondary18項目のR18が`confirmed`になったことで、値レベルのゲートを通過する貞子の具体的な数値が初めて生まれた。したがって現時点で研究モードのTargetとして選択できる貞子の数値は、5.2.3節のR18確定値（該当effectIdについてはプールレベルもすでに`allowed`）に限られる。例えば「Primary = `physical` 21.0%、Secondary = `fools_physical` 12.0%」のようなR18最高値狙いのTargetは研究モードで作成可能。一方、R16やR17の具体的な数値を要求するTarget（例:「Primaryの`physical`をR17で狙う」）は、その値がRatingへ直接対応づけられて`confirmed`になるまで、研究モードでは作成できない。ただしDrawEngine自体の抽選ではR16・R17も通常どおり生成される（5.2.3節「DrawEngine上の扱い」参照）。

#### 適用例: 第一確定グループ（v0.11で追加）

5.2.4節でPrimary7項目・Secondary9項目がR16/R17/R18すべて`confirmed`になったことで、これらの効果については最高値（R18）以外のRankも研究モードのTargetとして選択できるようになった。例えば「Primary = `physical` 20.3%（R17）」「Primary = `physical` 21.0%（R18）」「Secondary = `fools_physical` 11.1%（R16）/ 11.5%（R17）/ 12.0%（R18）」のいずれも研究モードでTarget化できる。一方、5.2.4節で昇格しなかった効果（R18のみ`confirmed`のもの、および完全未確定の効果）については、引き続き従来どおり未確定のrankのTarget化はできない。

---

## 8. バージョン管理

engineVersion（DrawEngine全体で共有される単一のバージョン文字列）とdataVersion（GemDataset単位）を実験ログの1行ごとにdatasetIdとともに保存する。

## 9. 出典管理（source metadata）

```
SourceMeta {
  sourceId: string
  sourceURL?: string
  sourceType: "wiki" | "datamine" | "tool" | "personal-verification" | "other"
  verificationStatus: "confirmed" | "provisional" | "unknown"
  sourcePrecision?: string
  appliesTo?: string[]
}
```

3デブの例は既存のまま（v0.3参照）。貞子のsourceMetaは5.2.1節に登録済み（v0.9で3件追加）。

## 10. 実験ログ（Google Spreadsheet送信項目）

| フィールド | 内容 |
|---|---|
| participant_id / experiment_id | 匿名ID・実験ごとのID |
| started_at / finished_at / duration_ms | 時刻・所要時間 |
| batch_count | 10連を押した回数 |
| dataset_id | 使用したGemDatasetのID |
| enemy / target_shape / target_primary / target_primary_rank / target_secondary / target_secondary_rank / accepted_curses | ターゲット条件一式 |
| desire_score | 実験前の欲しさ評価（1〜5） |
| roll_count | 実際の試行回数（血晶1個=1試行。研究モードではTarget Match位置まで。experiment_ui_flow_spec.md 3.1節参照） |
| theoretical_probability / expected_rolls | 事後開示する理論値 |
| sensor_score | 物欲センサーを感じた程度（1〜5） |
| success / censored | 条件達成の有無 / 途中で諦めたか |
| engine_version / data_version | バージョン |

---

## 現時点でのTBD一覧

- 3デブ: `dirty_rapid_poison`/`murky_slow_poison`のR17/R18、curseの実数値ValueSeries
- 貞子: 5.2.4節で昇格しなかった分。Primary16項目（うち11項目はR18のみconfirmed、`cold_arc_scaling`/`fools_all`/`nourishing`/`blood`/`poorman_all`の5項目はR18も含めTBD）・Secondary10項目（うち9項目はR18のみconfirmed、`fools_all`はR18も含めTBD）のR16/R17（一部R18も）ValueSeries
- 女幽霊: Primary残り20項目（`pthumeru_standard_primary_pool`のうちSec.1系列が未登録のもの）のValueSeries、Fixed Secondary（`poorman_physical`）のR15/R16直接対応
- `researchEligible`のしきい値
- `gemDropRate`レイヤーの設計（将来）

---

## 次のステップ

1. （ユーザー側）貞子の残りPrimary16項目・Secondary10項目のR16/R17 ValueSeriesを順次提供。
2. （ユーザー側）女幽霊のPrimary残り20項目のSec.1系列ValueSeries、Fixed SecondaryのR15/R16を順次提供。
3. データモデル確定後、M3E CanvasでUI設計
4. Claude Codeでの実装に着手

**本仕様書の段階ではコード実装には入らない。**
